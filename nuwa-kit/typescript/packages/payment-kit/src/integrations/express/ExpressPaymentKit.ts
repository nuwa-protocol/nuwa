import express, { Router, RequestHandler, Request, Response, NextFunction } from 'express';
import { BillableRouter, RouteOptions } from './BillableRouter';
import { HttpBillingMiddleware, ResponseAdapter } from '../../middlewares/http/HttpBillingMiddleware';
import { BillingEngine } from '../../billing';
import { ContractRateProvider } from '../../billing/rate/contract';
import { PaymentChannelPayeeClient } from '../../client/PaymentChannelPayeeClient';
import { RoochPaymentChannelContract } from '../../rooch/RoochPaymentChannelContract';
import { MemoryChannelRepository } from '../../storage';
import { ClaimScheduler } from '../../core/ClaimScheduler';
import { DIDAuth, VDRRegistry, RoochVDR } from '@nuwa-ai/identity-kit';
import { deriveChannelId } from '../../rooch/ChannelUtils';
import type { StrategyConfig } from '../../billing/types';
import type { RateProvider } from '../../billing/rate/types';
import type { SignerInterface, DIDResolver } from '@nuwa-ai/identity-kit';
import type { IPaymentChannelContract } from '../../contracts/IPaymentChannelContract';

/**
 * Configuration for creating ExpressPaymentKit
 */
export interface ExpressPaymentKitOptions {
  /** Service identifier */
  serviceId: string;
  /** Service private key (or KMS Signer) */
  signer: SignerInterface;

  /** Optional RPC URL (defaults to env.ROOCH_NODE_URL) */
  rpcUrl?: string;
  /** Optional network (defaults to 'local') */
  network?: 'local' | 'dev' | 'test' | 'main';
  /** Default asset ID for settlement */
  defaultAssetId?: string;
  /** Default price in picoUSD when no rule matches */
  defaultPricePicoUSD?: string | bigint;

  /**
   * Prefix under which all payment-channel routes are mounted.
   * Defaults to "/payment-channel".
   * Example: "/billing" or "/api/pay"
   */
  basePath?: string;

  /** One or more DIDs that are authorized to call admin endpoints (defaults to service signer DID) */
  adminDid?: string | string[];
  /** Debug logging */
  debug?: boolean;
}

/**
 * Express Payment Kit interface
 */
export interface ExpressPaymentKit {
  /** Express Router to mount in your app */
  readonly router: Router;
  
  /** HTTP verb methods for registering routes with billing */
  get(path: string, options: RouteOptions, handler: RequestHandler, ruleId?: string): this;
  post(path: string, options: RouteOptions, handler: RequestHandler, ruleId?: string): this;
  put(path: string, options: RouteOptions, handler: RequestHandler, ruleId?: string): this;
  delete(path: string, options: RouteOptions, handler: RequestHandler, ruleId?: string): this;
  patch(path: string, options: RouteOptions, handler: RequestHandler, ruleId?: string): this;
  
  /** Get the underlying PayeeClient for advanced operations */
  getPayeeClient(): PaymentChannelPayeeClient;
}

/**
 * Implementation of ExpressPaymentKit
 */
class ExpressPaymentKitImpl implements ExpressPaymentKit {
  public readonly router: Router;
  private readonly billableRouter: BillableRouter;
  private readonly middleware: HttpBillingMiddleware;
  private readonly config: ExpressPaymentKitOptions;
  private readonly payeeClient: PaymentChannelPayeeClient;
  private readonly rateProvider: RateProvider;
  private readonly serviceDid: string;
  private readonly claimScheduler: ClaimScheduler;

  constructor(
    config: ExpressPaymentKitOptions,
    payeeClient: PaymentChannelPayeeClient,
    rateProvider: RateProvider,
    serviceDid: string
  ) {
    this.config = config;
    this.payeeClient = payeeClient;
    this.rateProvider = rateProvider;
    this.serviceDid = serviceDid;
    
    // Create billable router
    this.billableRouter = new BillableRouter({
      serviceId: config.serviceId,
      defaultPricePicoUSD: config.defaultPricePicoUSD
    });

    // Create billing engine using the billable router as rule provider
    const billingEngine = new BillingEngine(this.billableRouter, rateProvider);

    // Create ClaimScheduler for automated claiming
    // Use the same RAV repository and contract as the PayeeClient
    this.claimScheduler = new ClaimScheduler({
      store: payeeClient.getRAVRepository(), // Use the same RAV repository
      contract: payeeClient.getContract(), // Use the same contract
      signer: config.signer,
      policy: {
        minClaimAmount: BigInt('10000000'), // 1 RGas minimum
        maxIntervalMs: 24 * 60 * 60 * 1000, // 24 hours maximum
        maxConcurrentClaims: 5,
        maxRetries: 3,
        retryDelayMs: 60_000 // 1 minute
      },
      pollIntervalMs: 30_000, // 30 seconds
      debug: config.debug || false
    });

    // Create HTTP billing middleware with ClaimScheduler
    this.middleware = new HttpBillingMiddleware({
      payeeClient,
      billingEngine,
      ruleProvider: this.billableRouter, // V2 optimization for pre-matching rules
      serviceId: config.serviceId,
      defaultAssetId: config.defaultAssetId || '0x3::gas_coin::RGas',
      debug: config.debug || false,
      claimScheduler: this.claimScheduler
    });

    // Create main router
    this.router = express.Router();
    
    // Set up discovery endpoint and routes
    this.setupRoutes();
  }

  /**
   * Set up all routes including discovery endpoint and payment-related routes
   */
  private setupRoutes(): void {
    const basePath = this.config.basePath || '/payment-channel';

    // 1. Discovery endpoint (well-known, completely public - no middleware)
    this.router.get('/.well-known/nuwa-payment/info', (req: Request, res: Response) => {
      this.handleDiscoveryRequest(req, res);
    });

    // 2. Create a sub-router for all payment-related routes
    const paymentRouter = express.Router();
    
    // Note: /info endpoint is removed - use /.well-known/nuwa-payment/info instead

    // Register built-in routes through BillableRouter for consistent auth/billing handling
    this.registerBuiltInRoutes();

    // Apply billing middleware wrapper to all payment routes
    paymentRouter.use(this.createBillingWrapper());

    // Mount billable router under payment routes
    paymentRouter.use(this.billableRouter.router);

    // Mount payment router under basePath
    this.router.use(basePath, paymentRouter);
  }

  /**
   * Register built-in routes through BillableRouter for consistent auth/billing handling
   */
  private registerBuiltInRoutes(): void {
    // Price endpoint (public, free, no auth required)
    this.billableRouter.get('/price', { 
      pricing: '0', 
      authRequired: false 
    }, async (req: Request, res: Response) => {
      await this.handlePriceRequest(req, res);
    }, 'builtin:price');

    // Recovery endpoint (private, free, auth required)
    this.billableRouter.get('/recovery', { 
      pricing: '0', 
      authRequired: true 
    }, async (req: Request, res: Response) => {
      await this.handleRecoveryRequest(req, res);
    }, 'builtin:recovery');

    // Commit endpoint (private, free, auth required)
    this.billableRouter.post('/commit', { 
      pricing: '0', 
      authRequired: true 
    }, async (req: Request, res: Response) => {
      await this.handleCommitRequest(req, res);
    }, 'builtin:commit');

    // Admin endpoints
    this.registerAdminRoutes();
  }

  /**
   * Register admin routes through BillableRouter for consistent auth/billing handling
   */
  private registerAdminRoutes(): void {
    // Health endpoint (public, no auth required)
    this.billableRouter.get('/admin/health', { 
      pricing: '0', 
      authRequired: false 
    }, async (req: Request, res: Response) => {
      await this.handleAdminHealthRequest(req, res);
    }, 'admin:health');

    // Claims endpoint (admin only)
    this.billableRouter.get('/admin/claims', { 
      pricing: '0', 
      adminOnly: true 
    }, async (req: Request, res: Response) => {
      await this.handleAdminClaimsRequest(req, res);
    }, 'admin:claims');

    // Manual claim trigger endpoint (admin only)
    this.billableRouter.post('/admin/claim/:channelId', { 
      pricing: '0', 
      adminOnly: true 
    }, async (req: Request, res: Response) => {
      await this.handleAdminClaimRequest(req, res);
    }, 'admin:claim');

    // Get SubRAV endpoint (admin only)
    this.billableRouter.get('/admin/subrav/:channelId/:nonce', { 
      pricing: '0', 
      adminOnly: true 
    }, async (req: Request, res: Response) => {
      await this.handleAdminSubRavRequest(req, res);
    }, 'admin:subrav');

    // Cleanup endpoint (admin only)
    this.billableRouter.delete('/admin/cleanup', { 
      pricing: '0', 
      adminOnly: true 
    }, async (req: Request, res: Response) => {
      await this.handleAdminCleanupRequest(req, res);
    }, 'admin:cleanup');
  }

  /**
   * Handle recovery endpoint requests
   */
  private async handleRecoveryRequest(req: Request, res: Response): Promise<void> {
    try {
      // Get clientDid from authenticated DID info (set by performDIDAuth)
      const didInfo = (req as any).didInfo;
      if (!didInfo || !didInfo.did) {
        res.status(401).json({ error: 'DID authentication required' });
        return;
      }
      const clientDid = didInfo.did;

      // Derive channelId deterministically using ChannelUtils
      const defaultAssetId = this.config.defaultAssetId ?? '0x3::gas_coin::RGas';
      const channelId = deriveChannelId(clientDid, this.serviceDid, defaultAssetId);

      let channel: any = null;
      try {
        channel = await this.payeeClient.getChannelInfo(channelId);
      } catch (_) {
        // Channel doesn't exist yet - this is normal for first-time clients
      }

      // Find the latest pending SubRAV for this channel (for recovery scenarios)
      const pending = await this.middleware.findLatestPendingProposal(channelId);

      const response = {
        channel: channel ?? null,
        pendingSubRav: pending ?? null,
        timestamp: new Date().toISOString()
      };
      
      // Serialize BigInt values before sending response
      const serializedResponse = this.serializeBigInt(response);
      res.json(serializedResponse);
    } catch (err) {
      res.status(500).json({ 
        error: 'Failed to perform recovery', 
        details: err instanceof Error ? err.message : String(err) 
      });
    }
  }

  /**
   * Handle commit endpoint requests
   */
  private async handleCommitRequest(req: Request, res: Response): Promise<void> {
    try {
      const { subRav } = req.body || {};
      if (!subRav) {
        res.status(400).json({ error: 'subRav required' });
        return;
      }

      try {
        await this.payeeClient.processSignedSubRAV(subRav);
        res.json({ success: true });
      } catch (e) {
        res.status(409).json({ error: (e as Error).message });
      }
    } catch (err) {
      res.status(500).json({ 
        error: 'Failed to commit SubRAV', 
        details: err instanceof Error ? err.message : String(err) 
      });
    }
  }

  /**
   * Handle admin health endpoint requests
   */
  private async handleAdminHealthRequest(req: Request, res: Response): Promise<void> {
    res.json({
      success: true,
      status: 'healthy',
      timestamp: new Date().toISOString(),
      paymentKitEnabled: true
    });
  }

  /**
   * Handle admin claims endpoint requests
   */
  private async handleAdminClaimsRequest(req: Request, res: Response): Promise<void> {
    try {
      console.log('📊 Admin: Getting claims status...');
      const claimsStatus = this.middleware.getClaimStatus();
      console.log('📊 Claims status:', JSON.stringify(claimsStatus, this.bigintReplacer));
      
      const processingStats = this.middleware.getProcessingStats();
      console.log('📊 Processing stats:', JSON.stringify(processingStats, this.bigintReplacer));
      
      const result = { 
        claimsStatus: this.serializeBigInt(claimsStatus),
        processingStats: this.serializeBigInt(processingStats),
        timestamp: new Date().toISOString()
      };
      console.log('✅ Admin: Claims data retrieved successfully');
      res.json(result);
    } catch (error) {
      console.error('❌ Admin: Failed to get claims status:', error);
      console.error('❌ Error stack:', error instanceof Error ? error.stack : 'No stack trace');
      res.status(500).json({ 
        error: error instanceof Error ? error.message : String(error),
        details: 'Failed to retrieve claims status'
      });
    }
  }

  /**
   * Handle admin claim trigger endpoint requests
   */
  private async handleAdminClaimRequest(req: Request, res: Response): Promise<void> {
    try {
      console.log('🚀 Admin: Triggering claim for channel:', req.params.channelId);
      const success = await this.middleware.manualClaim(req.params.channelId);
      console.log('✅ Admin: Claim trigger result:', success);
      res.json({ success, channelId: req.params.channelId });
    } catch (error) {
      console.error('❌ Admin: Failed to trigger claim:', error);
      console.error('❌ Error stack:', error instanceof Error ? error.stack : 'No stack trace');
      res.status(500).json({ 
        error: error instanceof Error ? error.message : String(error),
        details: 'Failed to trigger claim'
      });
    }
  }

  /**
   * Handle admin SubRAV endpoint requests
   */
  private async handleAdminSubRavRequest(req: Request, res: Response): Promise<void> {
    try {
      const { channelId, nonce } = req.params;
      console.log('📋 Admin: Getting SubRAV for channel:', channelId, 'nonce:', nonce);
      const subRAV = await this.middleware.findPendingProposal(channelId, BigInt(nonce));
      if (subRAV) {
        console.log('✅ Admin: SubRAV found:', JSON.stringify(subRAV, this.bigintReplacer));
        res.json(this.serializeBigInt(subRAV));
      } else {
        console.log('❌ Admin: SubRAV not found for channel:', channelId, 'nonce:', nonce);
        res.status(404).json({ error: 'SubRAV not found' });
      }
    } catch (error) {
      console.error('❌ Admin: Failed to get SubRAV:', error);
      console.error('❌ Error stack:', error instanceof Error ? error.stack : 'No stack trace');
      res.status(500).json({ 
        error: error instanceof Error ? error.message : String(error),
        details: 'Failed to retrieve SubRAV'
      });
    }
  }

  /**
   * Handle admin cleanup endpoint requests
   */
  private async handleAdminCleanupRequest(req: Request, res: Response): Promise<void> {
    try {
      const maxAge = parseInt(req.query.maxAge as string) || 30;
      console.log('🧹 Admin: Cleaning up expired proposals, max age:', maxAge, 'minutes');
      const clearedCount = await this.middleware.clearExpiredProposals(maxAge);
      console.log('✅ Admin: Cleanup completed, cleared count:', clearedCount);
      res.json({ clearedCount, maxAgeMinutes: maxAge });
    } catch (error) {
      console.error('❌ Admin: Failed to cleanup expired proposals:', error);
      console.error('❌ Error stack:', error instanceof Error ? error.stack : 'No stack trace');
      res.status(500).json({ 
        error: error instanceof Error ? error.message : String(error),
        details: 'Failed to cleanup expired proposals'
      });
    }
  }

  /**
   * Handle discovery requests for the well-known endpoint
   */
  private handleDiscoveryRequest(req: Request, res: Response): void {
    const discoveryInfo = {
      version: 1,
      serviceId: this.config.serviceId,
      serviceDid: this.serviceDid,
      network: this.config.network || 'test',
      defaultAssetId: this.config.defaultAssetId || '0x3::gas_coin::RGas',
      basePath: this.config.basePath || '/payment-channel'
    };

    if (this.config.defaultPricePicoUSD) {
      (discoveryInfo as any).defaultPricePicoUSD = this.config.defaultPricePicoUSD.toString();
    }

    // Set cache headers as recommended in the spec
    res.set('Cache-Control', 'max-age=3600, public');
    res.json(discoveryInfo);
  }

  /**
   * Handle price requests - get current asset price
   */
  private async handlePriceRequest(req: Request, res: Response): Promise<void> {
    try {
      const assetId = req.query.assetId as string || this.config.defaultAssetId || '0x3::gas_coin::RGas';
      
      // Get price from rate provider
      const pricePicoUSD = await this.rateProvider.getPricePicoUSD(assetId);
      const lastUpdated = this.rateProvider.getLastUpdated(assetId);
      
      // Convert picoUSD to USD (divide by 10^12)
      const priceUSD = Number(pricePicoUSD) / 1e12;
      
      const response = {
        assetId,
        priceUSD: priceUSD.toString(),
        pricePicoUSD: pricePicoUSD.toString(),
        timestamp: new Date().toISOString(),
        source: 'rate-provider',
        lastUpdated: lastUpdated ? new Date(lastUpdated).toISOString() : undefined
      };

      res.json(response);
    } catch (error) {
      console.error('Price request failed:', error);
      res.status(500).json({
        error: 'Price lookup failed',
        details: error instanceof Error ? error.message : String(error)
      });
    }
  }

  /**
   * Create billing middleware wrapper that includes DID auth and billing logic
   */
  private createBillingWrapper(): RequestHandler {
    return async (req: Request, res: Response, next: NextFunction) => {
      // Skip everything for health routes only
      if (req.path === '/health') {
        return next();
      }

      try {
        // Step 1: Find matching billing rule to determine auth and billing requirements
        const rule = this.billableRouter.findRule(req.method, req.path);
        console.log(`🔍 Found rule for ${req.method} ${req.path}:`, rule);

        // Step 2: Authentication (based on rule configuration)
        const needAuth = rule?.authRequired ?? false;
        const needAdminAuth = rule?.adminOnly ?? false;
        console.log(`🔐 Auth required for ${req.method} ${req.path}: ${needAuth}, Admin: ${needAdminAuth}`);
        
        if (needAuth || needAdminAuth) {
          await this.performDIDAuth(req, res);
        }
        
        if (needAdminAuth) {
          await this.performAdminAuth(req, res);
        }

        // Step 3: Apply billing middleware (for all registered routes)
        // Payment checking is now handled inside the middleware
        if (rule) {
          console.log(`💰 Applying billing for ${req.method} ${req.path}`);
          
          // Create response adapter for framework-agnostic billing
          const resAdapter = this.createResponseAdapter(res);
          
          // Use the new framework-agnostic handle method with rule information
          const result = await this.middleware.handle(req, resAdapter, rule);
          
          // Attach payment result to request for downstream handlers (Express-specific)
          if (result) {
            (req as any).paymentResult = result;
          }
        } else {
          console.log(`⏭️ Skipping billing for ${req.method} ${req.path} (unregistered route)`);
        }

        next();
      } catch (error) {
        console.error('🚨 Billing wrapper error:', error);
        res.status(500).json({ 
          error: 'Payment processing failed', 
          details: error instanceof Error ? error.message : String(error) 
        });
      }
    };
  }

  /**
   * Perform admin authorization check
   */
  private async performAdminAuth(req: express.Request, res: express.Response): Promise<void> {
    try {
      // Get allowed admin DIDs (default to service DID)
      const allowedDids = Array.isArray(this.config.adminDid) 
        ? this.config.adminDid 
        : this.config.adminDid 
          ? [this.config.adminDid] 
          : [this.serviceDid];

      // Get DID from request (set by performDIDAuth)
      const didInfo = (req as any).didInfo;
      if (!didInfo || !didInfo.did) {
        throw new Error('DID authentication required for admin access');
      }

      // Check if signer DID is authorized for admin operations
      const signerDid = didInfo.did;
      if (!allowedDids.includes(signerDid)) {
        throw new Error(`Access denied. DID ${signerDid} not authorized for admin operations`);
      }

      console.log(`✅ Admin authorization successful for DID: ${signerDid}`);
    } catch (error) {
      console.error('🚨 Admin authorization failed:', error);
      throw new Error(`Admin authorization failed: ${error instanceof Error ? error.message : String(error)}`);
    }
  }

  /**
   * Perform DID authentication using DIDAuthV1 scheme
   */
  private async performDIDAuth(req: express.Request, res: express.Response): Promise<void> {
    const AUTH_SCHEME = "DIDAuthV1";
    const HEADER_PREFIX = `${AUTH_SCHEME} `;
    
    try {
      const authHeader = req.headers.authorization;
      
      if (!authHeader || !authHeader.startsWith(HEADER_PREFIX)) {
        throw new Error("Missing or invalid Authorization header");
      }

      // Perform cryptographic verification via Nuwa Identity Kit
      const verifyResult = await DIDAuth.v1.verifyAuthHeader(
        authHeader,
        VDRRegistry.getInstance()
      );

      if (!verifyResult.ok) {
        throw new Error(verifyResult.error);
      }

      // Success path: extract signer DID and set it on the request
      (req as any).didInfo = { 
        did: verifyResult.signedObject.signature.signer_did 
      };

    } catch (error) {
      console.error('🚨 DID authentication failed:', error);
      throw new Error(`DID authentication failed: ${error instanceof Error ? error.message : String(error)}`);
    }
  }

  // HTTP verb methods
  get(path: string, options: RouteOptions, handler: RequestHandler, ruleId?: string): this {
    this.validateRouteOptions(options);
    this.billableRouter.get(path, options, handler, ruleId);
    this.clearBillingCache(); // Clear cache after adding route
    return this;
  }

  post(path: string, options: RouteOptions, handler: RequestHandler, ruleId?: string): this {
    this.validateRouteOptions(options);
    this.billableRouter.post(path, options, handler, ruleId);
    this.clearBillingCache(); // Clear cache after adding route
    return this;
  }

  put(path: string, options: RouteOptions, handler: RequestHandler, ruleId?: string): this {
    this.validateRouteOptions(options);
    this.billableRouter.put(path, options, handler, ruleId);
    this.clearBillingCache(); // Clear cache after adding route
    return this;
  }

  delete(path: string, options: RouteOptions, handler: RequestHandler, ruleId?: string): this {
    this.validateRouteOptions(options);
    this.billableRouter.delete(path, options, handler, ruleId);
    this.clearBillingCache(); // Clear cache after adding route
    return this;
  }

  patch(path: string, options: RouteOptions, handler: RequestHandler, ruleId?: string): this {
    this.validateRouteOptions(options);
    this.billableRouter.patch(path, options, handler, ruleId);
    this.clearBillingCache(); // Clear cache after adding route
    return this;
  }

  /**
   * Validate route options according to the security rules
   */
  private validateRouteOptions(options: RouteOptions): void {
    const pricing = typeof options.pricing === 'string' ? BigInt(options.pricing) : options.pricing;
    const pricingAmount = typeof pricing === 'bigint' ? pricing : BigInt(0);
    
    // Rule: If pricing > 0 and authRequired is explicitly false, throw error
    if (pricingAmount > 0 && options.authRequired === false) {
      throw new Error('Cannot create anonymous paid endpoints: pricing > 0 requires authRequired to be true or undefined');
    }

    // Rule: If adminOnly is true and authRequired is explicitly false, throw error
    if (options.adminOnly && options.authRequired === false) {
      throw new Error('Cannot create admin endpoints without authentication: adminOnly requires authRequired to be true or undefined');
    }
  }

  /**
   * Clear billing engine cache to ensure new routes are picked up
   */
  private clearBillingCache(): void {
    // With the new RuleProvider pattern, BillingEngine fetches rules dynamically
    // on each request, so no explicit cache clearing is needed.
    // This method is kept for API compatibility but does nothing.
  }

  /**
   * Create Express ResponseAdapter for framework-agnostic billing
   */
  private createResponseAdapter(res: Response): ResponseAdapter {
    return {
      setStatus: (code: number) => {
        res.status(code);
        return this.createResponseAdapter(res);
      },
      json: (obj: any) => {
        res.json(obj);
      },
      setHeader: (name: string, value: string) => {
        res.setHeader(name, value);
        return this.createResponseAdapter(res);
      }
    };
  }

  /**
   * JSON replacer function to handle BigInt serialization
   */
  private bigintReplacer(key: string, value: any): any {
    if (typeof value === 'bigint') {
      return value.toString();
    }
    return value;
  }

  /**
   * Recursively serialize BigInt values in an object to strings
   */
  private serializeBigInt(obj: any): any {
    if (obj === null || obj === undefined) {
      return obj;
    }
    
    if (typeof obj === 'bigint') {
      return obj.toString();
    }
    
    if (Array.isArray(obj)) {
      return obj.map(item => this.serializeBigInt(item));
    }
    
    if (typeof obj === 'object') {
      const result: any = {};
      for (const [key, value] of Object.entries(obj)) {
        result[key] = this.serializeBigInt(value);
      }
      return result;
    }
    
    return obj;
  }
 
  /**
   * Get the underlying PayeeClient for advanced operations
   */
  getPayeeClient(): PaymentChannelPayeeClient {
    return this.payeeClient;
  }
}

/**
 * Create an ExpressPaymentKit instance
 */
export async function createExpressPaymentKit(config: ExpressPaymentKitOptions): Promise<ExpressPaymentKit> {
  // Validate configuration
  if (!config.signer) {
    throw new Error('Service private key (signer) is required');
  }

  // Get service DID from signer
  const serviceDid = typeof (config.signer as any).getDid === 'function' 
    ? await (config.signer as any).getDid()
    : (() => { throw new Error('Signer must implement getDid() method to return the service DID'); })();

  // Set up blockchain connection
  const rpcUrl = config.rpcUrl;
  const network = config.network || 'test';
  
  // Initialize contract
  const contract = new RoochPaymentChannelContract({
    rpcUrl,
    network,
    debug: config.debug || false,
  });

  // Set up DID resolver with VDRRegistry
  const roochVDR = new RoochVDR({
    rpcUrl,
    network,
  });
  
  const vdrRegistry = VDRRegistry.getInstance();
  vdrRegistry.registerVDR(roochVDR);

  // Create PayeeClient
  const payeeClient = new PaymentChannelPayeeClient({
    contract,
    signer: config.signer,
    didResolver: vdrRegistry,
    storageOptions: {
      customChannelRepo: new MemoryChannelRepository(),
    },
  });

  // Create default ContractRateProvider
  const rateProvider = new ContractRateProvider(contract, 30_000);

  return new ExpressPaymentKitImpl(config, payeeClient, rateProvider, serviceDid);
}

// ---------------------------------------------------------------------------
// Express augmentation to include `didInfo`
// ---------------------------------------------------------------------------

declare global {
  namespace Express {
    interface Request {
      didInfo?: {
        did: string;
      };
    }
  }
} 