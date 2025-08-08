import express, { Router, RequestHandler, Request, Response, NextFunction } from 'express';
import onHeaders from 'on-headers';
import { BillableRouter, RouteOptions } from './BillableRouter';
import { registerHandlersWithBillableRouter } from './HandlerRestAdapter';
import { HttpBillingMiddleware, ResponseAdapter } from '../../middlewares/http/HttpBillingMiddleware';
import { RateProvider } from '../../billing';
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
      rateProvider: this.rateProvider,
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
    this.router.use(billingWrapper);
    this.router.use(this.billableRouter.router);
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
            console.log(`💰 Applying billing for ${req.method} ${req.path} with rule:`, rule.strategy.type);
          }
          
          // Create response adapter for framework-agnostic billing
          const resAdapter = this.createResponseAdapter(res);
          
          // Use new unified billing API  
          const billingContext = await this.middleware.handleWithNewAPI(req);
          
          if (!billingContext) {
            // No billing rule matched - proceed without payment
            if (this.config.debug) {
              console.log(`⏭️ No billing rule for ${req.method} ${req.path}`);
            }
            return next();
          }

          // Unified handling for both pre-flight and post-flight
          res.locals.billingContext = billingContext;

          // If processor marked a protocol-level error, short-circuit and return immediately
          if (billingContext.state?.error) {
            const err = billingContext.state.error as { code: string; message?: string };
            // Map to HTTP status
            let status = 500;
            switch (err.code) {
              case 'PAYMENT_REQUIRED':
              case 'INSUFFICIENT_FUNDS':
                status = 402; break;
              case 'INVALID_PAYMENT':
              case 'UNKNOWN_SUBRAV':
              case 'TAMPERED_SUBRAV':
              case 'CHANNEL_CLOSED':
              case 'EPOCH_MISMATCH':
              case 'MAX_AMOUNT_EXCEEDED':
              case 'CLIENT_TX_REF_MISSING':
                status = 400; break;
              case 'SUBRAV_CONFLICT':
                status = 409; break;
              case 'RATE_NOT_AVAILABLE':
              case 'BILLING_CONFIG_ERROR':
              default:
                status = 500; break;
            }

            // Build protocol error header
            const { HttpPaymentCodec } = await import('../../middlewares/http/HttpPaymentCodec');
            let clientTxRef: string | undefined;
            try {
              const headerValueIn = HttpPaymentCodec.extractPaymentHeader(req.headers as any);
              if (headerValueIn) {
                const payload = HttpPaymentCodec.parseRequestHeader(headerValueIn);
                clientTxRef = payload.clientTxRef;
              }
            } catch {}
            const headerValue = HttpPaymentCodec.buildResponseHeader({
              error: { code: err.code, message: err.message },
              clientTxRef,
              version: 1
            } as any);
            res.setHeader('X-Payment-Channel-Data', headerValue);

            return res.status(status).json({
              success: false,
              error: { code: err.code, message: err.message, httpStatus: status }
            });
          }

          let billingCompleted = false;
          let headerWritten = false;

          // Intercept headers to write payment header synchronously
          onHeaders(res, () => {
            if (headerWritten) return;
            headerWritten = true;
            try {
              const raw = (res.locals as any).usage;
              const units = typeof raw === 'number' && Number.isFinite(raw) && raw > 0 ? Math.floor(raw) : 1;
              this.middleware.settleBillingSync(billingContext, units, resAdapter);
            } catch (error) {
              console.error('🚨 Billing header error:', error);
            }
          });

          // Persist after response is sent
          res.on('finish', async () => {
            if (billingCompleted) return;
            billingCompleted = true;
            try {
              if (billingContext.state?.unsignedSubRav) {
                await this.middleware.persistBilling(billingContext);
              }
            } catch (error) {
              console.error('🚨 Billing persistence error:', error);
            }
          });

          return next();
        } else {
          if (this.config.debug) {
            console.log(`⏭️ Skipping billing for ${req.method} ${req.path} (unregistered route)`);
          }
        }

        next();
      } catch (error) {
        console.error('🚨 Billing wrapper error:', error);
        console.error('Error details:', {
          message: error instanceof Error ? error.message : String(error),
          stack: error instanceof Error ? error.stack : undefined,
          url: req.path,
          method: req.method,
          headers: req.headers
        });
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
        did: verifyResult.signedObject.signature.signer_did,
        keyId: verifyResult.signedObject.signature.key_id
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
        keyId: string;
      };
    }
  }
}