import express, { Router, RequestHandler, Request, Response, NextFunction } from 'express';
import { BillableRouter } from './BillableRouter';
import { HttpBillingMiddleware } from '../../middlewares/http/HttpBillingMiddleware';
import { UsdBillingEngine } from '../../billing/usd-engine';
import { ContractRateProvider } from '../../billing/rate/contract';
import { PaymentChannelPayeeClient } from '../../client/PaymentChannelPayeeClient';
import { RoochPaymentChannelContract } from '../../rooch/RoochPaymentChannelContract';
import { MemoryChannelRepository } from '../../storage';
import { DIDAuth, VDRRegistry, RoochVDR } from '@nuwa-ai/identity-kit';
import { deriveChannelId } from '../../core/ChannelUtils';
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
  get(path: string, pricing: bigint | string | StrategyConfig, handler: RequestHandler, ruleId?: string): this;
  post(path: string, pricing: bigint | string | StrategyConfig, handler: RequestHandler, ruleId?: string): this;
  put(path: string, pricing: bigint | string | StrategyConfig, handler: RequestHandler, ruleId?: string): this;
  delete(path: string, pricing: bigint | string | StrategyConfig, handler: RequestHandler, ruleId?: string): this;
  patch(path: string, pricing: bigint | string | StrategyConfig, handler: RequestHandler, ruleId?: string): this;
  
  /** Get recovery router for client data recovery */
  recoveryRouter(): Router;
  
  /** Get admin router for operations management */
  adminRouter(options?: { auth?: RequestHandler }): Router;
  
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

    // Create billing engine
    const configLoader = this.billableRouter.getConfigLoader();
    const usdBillingEngine = new UsdBillingEngine(configLoader, rateProvider);

    // Create HTTP billing middleware
    this.middleware = new HttpBillingMiddleware({
      payeeClient,
      billingEngine: usdBillingEngine,
      serviceId: config.serviceId,
      defaultAssetId: config.defaultAssetId || '0x3::gas_coin::RGas',
      debug: config.debug || false
    });

    // Create main router
    this.router = express.Router();
    
    // Apply billing middleware wrapper
    this.router.use(this.createBillingWrapper());
    
    // Mount billable router
    this.router.use(this.billableRouter.router);
  }

  /**
   * Create billing middleware wrapper that includes DID auth and billing logic
   */
  private createBillingWrapper(): RequestHandler {
    return async (req: Request, res: Response, next: NextFunction) => {
      // Skip billing for health routes only
      if (req.path === '/health') {
        return next();
      }

      try {
        // Step 1: DID Authentication (always required)
        await this.performDIDAuth(req, res);

        // Step 2: Apply billing middleware for non-admin routes
        if (!req.path.startsWith('/admin')) {
          const billingMiddleware = this.middleware.createExpressMiddleware();
          await new Promise<void>((resolve, reject) => {
            billingMiddleware(req as any, res as any, (error?: any) => {
              if (error) reject(error);
              else resolve();
            });
          });
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
  get(path: string, pricing: bigint | string | StrategyConfig, handler: RequestHandler, ruleId?: string): this {
    this.billableRouter.get(path, pricing, handler, ruleId);
    this.clearBillingCache(); // Clear cache after adding route
    return this;
  }

  post(path: string, pricing: bigint | string | StrategyConfig, handler: RequestHandler, ruleId?: string): this {
    this.billableRouter.post(path, pricing, handler, ruleId);
    this.clearBillingCache(); // Clear cache after adding route
    return this;
  }

  put(path: string, pricing: bigint | string | StrategyConfig, handler: RequestHandler, ruleId?: string): this {
    this.billableRouter.put(path, pricing, handler, ruleId);
    this.clearBillingCache(); // Clear cache after adding route
    return this;
  }

  delete(path: string, pricing: bigint | string | StrategyConfig, handler: RequestHandler, ruleId?: string): this {
    this.billableRouter.delete(path, pricing, handler, ruleId);
    this.clearBillingCache(); // Clear cache after adding route
    return this;
  }

  patch(path: string, pricing: bigint | string | StrategyConfig, handler: RequestHandler, ruleId?: string): this {
    this.billableRouter.patch(path, pricing, handler, ruleId);
    this.clearBillingCache(); // Clear cache after adding route
    return this;
  }

  /**
   * Clear billing engine cache to ensure new routes are picked up
   */
  private clearBillingCache(): void {
    // Access the billing engine through the middleware and clear its cache
    // This ensures that newly registered routes are picked up on next billing calculation
    (this.middleware as any).processor?.billingEngine?.clearCache?.(this.config.serviceId);
  }

  /**
   * Get recovery router for client data recovery
   */
  recoveryRouter(): Router {
    const router = express.Router();
    

    // GET /price - Get current price for an asset
    router.get('/price', async (req: Request, res: Response) => {
      try {
        const assetId = req.query.assetId as string;
        if (!assetId) {
          return res.status(400).json({ error: 'Missing assetId parameter' });
        }

        // Get price from rate provider
        try {
          const pricePicoUSD = await this.rateProvider.getPricePicoUSD(assetId);
          const priceUSD = (Number(pricePicoUSD) / 1e12).toString();
          
          res.json({ 
            assetId,
            priceUSD,
            pricePicoUSD: pricePicoUSD.toString(),
            timestamp: new Date().toISOString(),
            source: 'rate_provider',
            lastUpdated: this.rateProvider.getLastUpdated(assetId) || undefined
          });
        } catch (rateError) {
          // No fallback - rate provider error should be reported to client
          throw rateError;
        }
      } catch (error) {
        res.status(500).json({ 
          error: 'Failed to get asset price',
          details: error instanceof Error ? error.message : String(error)
        });
      }
    });

    // -------------------------------------------------------------------
    // New unified recovery endpoints
    // -------------------------------------------------------------------

    // GET /info - public service metadata
    router.get('/info', (_req: Request, res: Response) => {
      res.json({
        serviceId: this.config.serviceId,
        serviceDid: this.serviceDid,
        network: this.config.network ?? 'local',
        defaultAssetId: this.config.defaultAssetId ?? '0x3::gas_coin::RGas',
        defaultPricePicoUSD: this.config.defaultPricePicoUSD?.toString(),
        timestamp: new Date().toISOString()
      });
    });

    // GET /recovery - channel state & pending SubRAV
    router.get('/recovery', async (req: Request, res: Response) => {
      try {
        // Get clientDid from authenticated DID info (set by performDIDAuth)
        const didInfo = (req as any).didInfo;
        if (!didInfo || !didInfo.did) {
          return res.status(401).json({ error: 'DID authentication required' });
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

        res.json({
          channel: channel ?? null,
          pendingSubRav: pending ?? null,
          timestamp: new Date().toISOString()
        });
      } catch (err) {
        res.status(500).json({ error: 'Failed to perform recovery', details: err instanceof Error ? err.message : String(err) });
      }
    });

    // POST /commit - submit signed SubRAV
    router.post('/commit', async (req: Request, res: Response) => {
      try {

        const { subRav } = req.body || {};
        if (!subRav) {
          return res.status(400).json({ error: 'subRav required' });
        }

        try {
          await this.payeeClient.processSignedSubRAV(subRav);
          res.json({ success: true });
        } catch (e) {
          res.status(409).json({ error: (e as Error).message });
        }
      } catch (err) {
        res.status(500).json({ error: 'Failed to commit SubRAV', details: err instanceof Error ? err.message : String(err) });
      }
    });

    return router;
  }

  /**
   * Create admin authorization middleware (checks if authenticated DID has admin permissions)
   */
  private createAdminAuthMiddleware(): RequestHandler {
    return (req: Request, res: Response, next: NextFunction) => {
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
          return res.status(401).json({ 
            error: 'DID authentication required.' 
          });
        }

        // Check if signer DID is authorized for admin operations
        const signerDid = didInfo.did;
        if (!allowedDids.includes(signerDid)) {
          return res.status(403).json({ 
            error: 'Access denied. DID not authorized for admin operations.',
            signerDid
          });
        }

        next();
      } catch (error) {
        console.error('Admin authorization middleware error:', error);
        res.status(500).json({ 
          error: 'Authorization failed', 
          details: error instanceof Error ? error.message : String(error) 
        });
      }
    };
  }

  /**
   * Get admin router for operations management
   */
  adminRouter(options?: { auth?: RequestHandler }): Router {
    const router = express.Router();

    // Health endpoint (no auth required)
    router.get('/health', (_req: Request, res: Response) => {
      res.json({
        success: true,
        status: 'healthy',
        timestamp: new Date().toISOString(),
        paymentKitEnabled: true
      });
    });

    // Apply custom auth middleware if provided, otherwise use admin authorization check
    const authMiddleware = options?.auth || this.createAdminAuthMiddleware();
    router.use(authMiddleware);

    // GET /claims - Get claim status and processing stats
    router.get('/claims', async (req: Request, res: Response) => {
      try {
        const claimsStatus = this.middleware.getClaimStatus();
        const processingStats = this.middleware.getProcessingStats();
        
        res.json({ 
          claimsStatus,
          processingStats,
          timestamp: new Date().toISOString()
        });
      } catch (error) {
        res.status(500).json({ 
          error: error instanceof Error ? error.message : String(error) 
        });
      }
    });

    // POST /claim/:channelId - Manually trigger claim
    router.post('/claim/:channelId', async (req: Request, res: Response) => {
      try {
        const success = await this.middleware.manualClaim(req.params.channelId);
        res.json({ success, channelId: req.params.channelId });
      } catch (error) {
        res.status(500).json({ 
          error: error instanceof Error ? error.message : String(error) 
        });
      }
    });

    // GET /subrav/:channelId/:nonce - Get specific SubRAV
    router.get('/subrav/:channelId/:nonce', async (req: Request, res: Response) => {
      try {
        const { channelId, nonce } = req.params;
        const subRAV = await this.middleware.findPendingProposal(channelId, BigInt(nonce));
        if (subRAV) {
          res.json(subRAV);
        } else {
          res.status(404).json({ error: 'SubRAV not found' });
        }
      } catch (error) {
        res.status(500).json({ 
          error: error instanceof Error ? error.message : String(error) 
        });
      }
    });

    // DELETE /cleanup - Clean up expired proposals
    router.delete('/cleanup', async (req: Request, res: Response) => {
      try {
        const maxAge = parseInt(req.query.maxAge as string) || 30;
        const clearedCount = await this.middleware.clearExpiredProposals(maxAge);
        res.json({ clearedCount, maxAgeMinutes: maxAge });
      } catch (error) {
        res.status(500).json({ 
          error: error instanceof Error ? error.message : String(error) 
        });
      }
    });

    return router;
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