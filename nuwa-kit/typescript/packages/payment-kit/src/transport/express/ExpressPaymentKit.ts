import express, { Router, RequestHandler, Request, Response, NextFunction } from 'express';
import onHeaders from 'on-headers';
import { BillableRouter, RouteOptions } from './BillableRouter';
import { registerHandlersWithBillableRouter } from './HandlerRestAdapter';
import { HttpBillingMiddleware, ResponseAdapter } from '../../middlewares/http/HttpBillingMiddleware';
import { BillingEngine, RateProvider } from '../../billing';
import { ContractRateProvider } from '../../billing/rate/contract';
import { PaymentChannelPayeeClient } from '../../client/PaymentChannelPayeeClient';
import { RoochPaymentChannelContract } from '../../rooch/RoochPaymentChannelContract';
import { MemoryChannelRepository } from '../../storage';
import { ClaimScheduler } from '../../core/ClaimScheduler';
import { DIDAuth, VDRRegistry, RoochVDR } from '@nuwa-ai/identity-kit';
import type { SignerInterface, DIDResolver } from '@nuwa-ai/identity-kit';
import type { IPaymentChannelContract } from '../../contracts/IPaymentChannelContract';
import { BuiltInApiHandlers } from '../../api';
import type { ApiContext } from '../../types/api';

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
    
    // Create single billable router for all routes (business + built-in)
    this.billableRouter = new BillableRouter({
      serviceId: config.serviceId,
      defaultPricePicoUSD: config.defaultPricePicoUSD
    });

    // Create billing engine using the billable router as rule provider
    const billingEngine = new BillingEngine(this.billableRouter, rateProvider);

    // Create ClaimScheduler for automated claiming
    this.claimScheduler = new ClaimScheduler({
      store: payeeClient.getRAVRepository(),
      contract: payeeClient.getContract(),
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
      ruleProvider: this.billableRouter,
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

    // Create API context for handlers
    const apiContext: ApiContext = {
      config: {
        serviceId: this.config.serviceId,
        serviceDid: this.serviceDid,
        defaultAssetId: this.config.defaultAssetId || '0x3::gas_coin::RGas',
        defaultPricePicoUSD: this.config.defaultPricePicoUSD?.toString(),
        adminDid: this.config.adminDid,
        debug: this.config.debug
      },
      payeeClient: this.payeeClient,
      rateProvider: this.rateProvider,
      middleware: this.middleware,
      claimScheduler: this.claimScheduler
    };

    // 1. Discovery endpoint (well-known, completely public - no middleware)
    // This is handled directly to maintain compatibility and avoid billing
    this.router.get('/.well-known/nuwa-payment/info', (req: Request, res: Response) => {
      this.handleDiscoveryRequest(req, res);
    });

    // 2. Register built-in handlers with prefix using the single BillableRouter
    registerHandlersWithBillableRouter(BuiltInApiHandlers, apiContext, this.billableRouter, {
      pathPrefix: basePath
    });

    // 3. Create billing middleware wrapper and mount all routes
    const billingWrapper = this.createBillingWrapper();
    this.router.use(billingWrapper, this.billableRouter.router);
  }

  /**
   * Handle discovery requests for the well-known endpoint
   * Note: Uses direct response format (not ApiResponse) to comply with well-known URI standards
   */
  private handleDiscoveryRequest(req: Request, res: Response): void {
    const discoveryInfo: any = {
      version: 1,
      serviceId: this.config.serviceId,
      serviceDid: this.serviceDid,
      network: this.config.network || 'test',
      defaultAssetId: this.config.defaultAssetId || '0x3::gas_coin::RGas',
      basePath: this.config.basePath || '/payment-channel'
    };

    if (this.config.defaultPricePicoUSD) {
      discoveryInfo.defaultPricePicoUSD = this.config.defaultPricePicoUSD.toString();
    }

    // Set cache headers as recommended in the spec
    res.set('Cache-Control', 'max-age=3600, public');
    res.json(discoveryInfo);
  }

  /**
   * Create billing middleware wrapper with automatic pre/post-flight detection
   */
  private createBillingWrapper(): RequestHandler {
    return async (req: Request, res: Response, next: NextFunction) => {
      try {
        // Step 1: Find matching billing rule to determine auth and billing requirements
        const rule = this.billableRouter.findRule(req.method, req.path);
        if (this.config.debug) {
          console.log(`🔍 Found rule for ${req.method} ${req.path}:`, rule);
        }

        // Step 2: Authentication (based on rule configuration)
        const needAuth = rule?.authRequired ?? false;
        const needAdminAuth = rule?.adminOnly ?? false;
        if (this.config.debug) {
          console.log(`🔐 Auth required for ${req.method} ${req.path}: ${needAuth}, Admin: ${needAdminAuth}`);
        }
        
        if (needAuth || needAdminAuth) {
          await this.performDIDAuth(req, res);
        }
        
        if (needAdminAuth) {
          await this.performAdminAuth(req, res);
        }

        // Step 3: Apply billing middleware (for all registered routes)
        if (rule) {
          if (this.config.debug) {
            console.log(`💰 Applying billing for ${req.method} ${req.path}`);
          }
          
          // Create response adapter for framework-agnostic billing
          const resAdapter = this.createResponseAdapter(res);
          
          // Use auto-detection for pre/post-flight billing
          const detection = await this.middleware.handleWithAutoDetection(req, resAdapter);
          
          if (!detection.isDeferred) {
            // Pre-flight billing completed or no billing needed
            if (detection.result) {
              // Pre-flight billing successful
              (req as any).paymentResult = detection.result;
              return next();
            } else if (detection.result === null) {
              // Pre-flight billing failed - response already sent by middleware
              if (this.config.debug) {
                console.log('❌ Pre-flight billing failed, blocking request continuation');
              }
              return;
            } else {
              // No billing rule matched (result is undefined) - proceed without payment
              return next();
            }
          } else {
          // Post-flight billing - attach payment session to response locals
          if (detection.paymentSession) {
            res.locals.paymentSession = detection.paymentSession;
            
            // Use on-headers package for reliable header interception
            let billingCompleted = false;
            let headerWritten = false;
            
            // CRITICAL: Use on-headers package to intercept before headers are sent
            onHeaders(res, () => {
              console.log('🔄 on-headers triggered for post-flight billing');
              
              // Guard 1: Prevent multiple executions
              if (headerWritten) {
                return;
              }
              headerWritten = true;

              try {
                // Extract usage data from response locals (populated by business logic)
                const usage = res.locals.usage || {};
                if (Object.keys(usage).length > 0) {
                  if (this.config.debug) {
                    console.log('🔄 Processing post-flight billing synchronously with usage:', usage);
                  }
                  
                  // Complete deferred billing synchronously using a blocking approach
                  this.completeDeferredBillingSync(detection.paymentSession!, usage, resAdapter);
                  
                  if (this.config.debug) {
                    console.log('✅ Post-flight billing header completed synchronously');
                  }
                } else {
                  console.warn('⚠️ No usage data found in res.locals.usage for post-flight billing');
                }
              } catch (error) {
                console.error('🚨 Post-flight billing header error:', error);
                // Don't fail the request, just log the error
              }
            });
            
            // Use 'finish' event for async chain operations after headers are sent
            res.on('finish', async () => {
              if (billingCompleted) return;
              billingCompleted = true;
              
              try {
                const usage = res.locals.usage || {};
                if (Object.keys(usage).length > 0) {
                  if (this.config.debug) {
                    console.log('🔄 Completing async post-flight chain operations with usage:', usage);
                  }
                  
                  // This handles the async chain operations (SubRAV processing, etc.)
                  await this.middleware.completeDeferredBilling(
                    detection.paymentSession!, 
                    usage, 
                    this.createNullResponseAdapter() // Don't modify headers here
                  );
                  
                  if (this.config.debug) {
                    console.log('✅ Async post-flight chain operations completed');
                  }
                }
              } catch (error) {
                console.error('🚨 Async post-flight chain operations error:', error);
              }
            });
          }
          return next();
        }
        } else {
          if (this.config.debug) {
            console.log(`⏭️ Skipping billing for ${req.method} ${req.path} (unregistered route)`);
          }
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

      if (this.config.debug) {
        console.log(`✅ Admin authorization successful for DID: ${signerDid}`);
      }
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
    return this;
  }

  post(path: string, options: RouteOptions, handler: RequestHandler, ruleId?: string): this {
    this.validateRouteOptions(options);
    this.billableRouter.post(path, options, handler, ruleId);
    return this;
  }

  put(path: string, options: RouteOptions, handler: RequestHandler, ruleId?: string): this {
    this.validateRouteOptions(options);
    this.billableRouter.put(path, options, handler, ruleId);
    return this;
  }

  delete(path: string, options: RouteOptions, handler: RequestHandler, ruleId?: string): this {
    this.validateRouteOptions(options);
    this.billableRouter.delete(path, options, handler, ruleId);
    return this;
  }

  patch(path: string, options: RouteOptions, handler: RequestHandler, ruleId?: string): this {
    this.validateRouteOptions(options);
    this.billableRouter.patch(path, options, handler, ruleId);
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
        if (!res.headersSent) {
          res.setHeader(name, value);
        } else if (this.config.debug) {
          console.warn(`⚠️ Cannot set header '${name}' after headers sent`);
        }
        return this.createResponseAdapter(res);
      }
    };
  }

  /**
   * Create a null response adapter that doesn't modify the response
   * Used for async operations after headers are sent
   */
  private createNullResponseAdapter(): ResponseAdapter {
    return {
      setStatus: (code: number) => {
        // Do nothing - headers already sent
        return this.createNullResponseAdapter();
      },
      json: (obj: any) => {
        // Do nothing - response already sent
      },
      setHeader: (name: string, value: string) => {
        // Do nothing - headers already sent
        return this.createNullResponseAdapter();
      }
    };
  }
 
  /**
   * Complete deferred billing synchronously for header writing
   * This calculates the cost and generates the response header immediately
   */
  private completeDeferredBillingSync(
    paymentSession: any, 
    usage: Record<string, any>, 
    resAdapter: ResponseAdapter
  ): void {
    try {
      const rule = paymentSession.rule;
      const strategy = rule.strategy;
      
      if (strategy.type !== 'PerToken') {
        console.warn('⚠️ Unsupported strategy type for sync billing:', strategy.type);
        return;
      }

      // Calculate cost synchronously
      const unitPricePicoUSD = BigInt(strategy.unitPricePicoUSD);
      const totalTokens = this.extractTokenCountSync(usage, strategy.usageKey);
      const cost = unitPricePicoUSD * BigInt(totalTokens);

      // Generate header payload manually (simplified version)
      const clientTxRef = paymentSession.ctx.meta?.clientTxRef || crypto.randomUUID();
      const serviceTxRef = `srv-${Date.now()}`;
      
      const responsePayload = {
        amountDebited: cost.toString(),
        costUsd: cost.toString(), // Same as amountDebited for now
        subRav: paymentSession.signedSubRav || {},
        clientTxRef: clientTxRef,
        serviceTxRef: serviceTxRef,
        nonce: (paymentSession.signedSubRav?.nonce || 0) + 1,
        message: 'Post-flight billing completed',
        errorCode: 0
      };
      
      // Encode to base64url JSON
      const headerValue = Buffer.from(JSON.stringify(responsePayload)).toString('base64url');
      resAdapter.setHeader('X-Payment-Channel-Data', headerValue);

      if (this.config.debug) {
        console.log('✅ Synchronous post-flight header written:', { 
          cost: cost.toString(), 
          tokens: totalTokens, 
          clientTxRef,
          serviceTxRef 
        });
      }
    } catch (err) {
      console.error('🚨 Synchronous deferred billing error:', err);
      throw err;
    }
  }

  /**
   * Extract token count from usage data synchronously
   */
  private extractTokenCountSync(usage: any, usageKey: string): number {
    try {
      // usageKey format: "usage.total_tokens"
      const keys = usageKey.split('.');
      let value = usage;
      for (const key of keys) {
        value = value[key];
        if (value === undefined) {
          return 0;
        }
      }
      return typeof value === 'number' ? value : parseInt(value) || 0;
    } catch {
      return 0;
    }
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