import express, { Router, RequestHandler, Request, Response, NextFunction } from 'express';
import onHeaders from 'on-headers';
import { BillableRouter, RouteOptions } from './BillableRouter';
import { registerHandlersWithBillableRouter } from './HandlerRestAdapter';
import {
  HttpBillingMiddleware,
  ResponseAdapter,
} from '../../middlewares/http/HttpBillingMiddleware';
import { RateProvider } from '../../billing';
import { ContractRateProvider } from '../../billing/rate/contract';
import { PaymentChannelPayeeClient } from '../../client/PaymentChannelPayeeClient';
import { RoochPaymentChannelContract } from '../../rooch/RoochPaymentChannelContract';
import {
  createStorageRepositories,
  type ChannelRepository,
  type PendingSubRAVRepository,
  type RAVRepository,
} from '../../storage';
import { ClaimScheduler, DEFAULT_CLAIM_POLICY } from '../../core/ClaimScheduler';
import type { ClaimPolicy } from '../../core/ClaimScheduler';
import { DIDAuth, VDRRegistry, RoochVDR } from '@nuwa-ai/identity-kit';
import type { SignerInterface, DIDResolver } from '@nuwa-ai/identity-kit';
import { DebugLogger } from '@nuwa-ai/identity-kit';
import type { IPaymentChannelContract } from '../../contracts/IPaymentChannelContract';
import { BuiltInApiHandlers } from '../../api';
import type { ApiContext } from '../../types/api';
import { HttpPaymentCodec } from '../../middlewares/http/HttpPaymentCodec';
import { httpStatusFor, PaymentErrorCode } from '../../errors/codes';
import { registerBuiltinStrategies } from '../../billing/strategies';
import { PaymentProcessor } from '../../core/PaymentProcessor';
import { HubBalanceService, type HubBalanceServiceOptions } from '../../core/HubBalanceService';
import { ClaimTriggerService, type ClaimTriggerOptions, DEFAULT_REACTIVE_CLAIM_POLICY } from '../../core/ClaimTriggerService';
import { isStreamingRequest } from './utils';

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

  /** Optional ClaimScheduler configuration */
  claimScheduler?: {
    /** Override claiming policy; only set fields you want to change */
    policy?: Partial<ClaimPolicy> & { minClaimAmount?: bigint | string };
    /** Polling interval in milliseconds (default: 30s) */
    pollIntervalMs?: number;
    /** Enable detailed debug logs for scheduler */
    debug?: boolean;
    /** Auto start the scheduler on kit initialization (default: true) */
    autoStart?: boolean;
  };

  /** PaymentHub balance caching configuration */
  hubBalance?: {
    /** Normal cache TTL in milliseconds */
    ttlMs?: number;
    /** Negative cache TTL for zero balances */
    negativeTtlMs?: number;
    /** Stale-while-revalidate window in milliseconds */
    staleWhileRevalidateMs?: number;
    /** Maximum cache entries */
    maxEntries?: number;
  };

  /** Claim triggering configuration */
  claim?: {
    /** Claim mode - default 'reactive' (event-driven) */
    mode?: 'reactive' | 'polling' | 'hybrid';
    /** Claim policy configuration */
    policy?: Partial<ClaimPolicy> & { minClaimAmount?: bigint | string };
    /** Require hub balance check before triggering claims (default: true) */
    requireHubBalance?: boolean;
    /** Maximum concurrent claims across all sub-channels (default: 5) */
    maxConcurrentClaims?: number;
    /** Maximum retry attempts for failed claims (default: 3) */
    maxRetries?: number;
    /** Delay between retry attempts in milliseconds (default: 60000ms = 60s) */
    retryDelayMs?: number;
  };
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
  // Hold storage repositories explicitly for reuse across components
  private readonly channelRepo: ChannelRepository;
  private readonly ravRepo: RAVRepository;
  private readonly pendingSubRAVRepo: PendingSubRAVRepository;
  private readonly processor: PaymentProcessor;
  private readonly logger: DebugLogger;
  // New services for reactive claim and hub balance
  private readonly hubBalanceService: HubBalanceService;
  private readonly claimTriggerService?: ClaimTriggerService;

  constructor(
    config: ExpressPaymentKitOptions,
    deps: {
      contract: IPaymentChannelContract;
      signer: SignerInterface;
      didResolver: DIDResolver;
      rateProvider: RateProvider;
      serviceDid: string;
    },
    prebuiltStorage?: {
      channelRepo: ChannelRepository;
      ravRepo: RAVRepository;
      pendingSubRAVRepo: PendingSubRAVRepository;
    }
  ) {
    this.logger = DebugLogger.get('ExpressPaymentKit');
    this.config = config;
    this.rateProvider = deps.rateProvider;
    this.serviceDid = deps.serviceDid;
    // Ensure built-in billing strategies are registered when server starts
    registerBuiltinStrategies();

    // Resolve storage repositories
    const storage = prebuiltStorage ?? this.resolveStorageFromEnv();
    this.channelRepo = storage.channelRepo;
    this.ravRepo = storage.ravRepo;
    this.pendingSubRAVRepo = storage.pendingSubRAVRepo;

    // Create PayeeClient inside impl to ensure shared storage
    this.payeeClient = new PaymentChannelPayeeClient({
      contract: deps.contract,
      signer: deps.signer,
      didResolver: deps.didResolver,
      storageOptions: {
        channelRepo: this.channelRepo,
        ravRepo: this.ravRepo,
        pendingSubRAVRepo: this.pendingSubRAVRepo,
      },
    });

    // Create single billable router for all routes (business + built-in)
    this.billableRouter = new BillableRouter({
      serviceId: config.serviceId,
      defaultPricePicoUSD: config.defaultPricePicoUSD,
    });

    // Create ClaimScheduler for automated claiming (configurable)
    const defaultPolicy: ClaimPolicy = DEFAULT_CLAIM_POLICY;
    const userPolicy = config.claimScheduler?.policy || {};
    // Only include defined values in normalized policy to avoid overriding defaults with undefined
    const normalizedUserPolicy: Partial<ClaimPolicy> = {};
    
    // Only set fields that are actually provided (not undefined)
    if (userPolicy.minClaimAmount !== undefined) {
      normalizedUserPolicy.minClaimAmount =
        typeof userPolicy.minClaimAmount === 'string'
          ? BigInt(userPolicy.minClaimAmount)
          : userPolicy.minClaimAmount;
    }
    if (userPolicy.maxConcurrentClaims !== undefined) {
      normalizedUserPolicy.maxConcurrentClaims = userPolicy.maxConcurrentClaims;
    }
    if (userPolicy.maxRetries !== undefined) {
      normalizedUserPolicy.maxRetries = userPolicy.maxRetries;
    }
    if (userPolicy.retryDelayMs !== undefined) {
      normalizedUserPolicy.retryDelayMs = userPolicy.retryDelayMs;
    }

    const schedulerPolicy: ClaimPolicy = {
      ...defaultPolicy,
      ...normalizedUserPolicy,
    } as ClaimPolicy;
    
    // Runtime safety check: ensure minClaimAmount is defined
    if (schedulerPolicy.minClaimAmount === undefined || schedulerPolicy.minClaimAmount === null) {
      throw new Error('Internal error: schedulerPolicy.minClaimAmount should never be undefined after merging with defaults');
    }
    const schedulerPollMs =
      typeof config.claimScheduler?.pollIntervalMs === 'number'
        ? config.claimScheduler!.pollIntervalMs!
        : 30_000;
    const schedulerDebug = config.claimScheduler?.debug ?? config.debug ?? false;

    this.claimScheduler = new ClaimScheduler({
      store: this.ravRepo,
      contract: this.payeeClient.getContract(),
      signer: config.signer,
      channelRepo: this.channelRepo,
      policy: schedulerPolicy,
      pollIntervalMs: schedulerPollMs,
      debug: schedulerDebug,
    });

    // Initialize HubBalanceService (always enabled)
    this.hubBalanceService = new HubBalanceService({
      contract: deps.contract,
      defaultAssetId: config.defaultAssetId || '0x3::gas_coin::RGas',
      ttlMs: config.hubBalance?.ttlMs,
      negativeTtlMs: config.hubBalance?.negativeTtlMs,
      staleWhileRevalidateMs: config.hubBalance?.staleWhileRevalidateMs,
      maxEntries: config.hubBalance?.maxEntries,
      debug: config.debug,
    });

    // Initialize ClaimTriggerService if reactive mode is enabled
    const claimMode = config.claim?.mode ?? 'reactive';
    if (claimMode === 'reactive' || claimMode === 'hybrid') {
      this.claimTriggerService = new ClaimTriggerService({
        policy: {
          // Only override non-default values from config
          minClaimAmount: schedulerPolicy.minClaimAmount, // Should now always have a value from defaultPolicy
          maxConcurrentClaims: config.claim?.maxConcurrentClaims,
          maxRetries: config.claim?.maxRetries,
          retryDelayMs: config.claim?.retryDelayMs,
          requireHubBalance: config.claim?.requireHubBalance,
        },
        contract: deps.contract,
        signer: deps.signer, // Pass the payee signer
        ravRepo: this.ravRepo,
        channelRepo: this.channelRepo,
        debug: config.debug,
      });
    }

    // Initialize PaymentProcessor with config
    this.processor = new PaymentProcessor({
      payeeClient: this.payeeClient,
      serviceId: config.serviceId,
      defaultAssetId: config.defaultAssetId,
      rateProvider: this.rateProvider,
      pendingSubRAVStore: this.pendingSubRAVRepo,
      ravRepository: this.ravRepo,
      didResolver: this.payeeClient.getDidResolver(),
      hubBalanceService: this.hubBalanceService,
      claimTriggerService: this.claimTriggerService,
      minClaimAmount: schedulerPolicy.minClaimAmount,
      debug: config.debug,
    });

    // Create HTTP billing middleware with ClaimScheduler
    this.middleware = new HttpBillingMiddleware({
      processor: this.processor,
      ruleProvider: this.billableRouter,
    });

    // Create main router
    this.router = express.Router();

    // Set up discovery endpoint and routes
    this.setupRoutes();

    // Start background claim scheduler by default (configurable)
    // Only start if not in reactive mode or if explicitly configured
    const autoStart = config.claimScheduler?.autoStart ?? true;
    const shouldStartPolling = autoStart && (claimMode === 'polling' || claimMode === 'hybrid');
    if (shouldStartPolling) {
      try {
        this.claimScheduler.start();
        this.logger.info('ClaimScheduler started in polling mode', { mode: claimMode });
      } catch (e) {
        this.logger.warn('Failed to start ClaimScheduler', { error: e });
      }
    } else if (claimMode === 'reactive') {
      this.logger.info('ClaimScheduler disabled - using reactive claim mode');
    }
  }

  /**
   * Resolve storage repositories based on environment variables.
   * Priority: PAYMENTKIT_CONNECTION_STRING > SUPABASE_DB_URL > DATABASE_URL.
   * Backend selection: PAYMENTKIT_BACKEND or infer from connection string.
   */
  private resolveStorageFromEnv(): {
    channelRepo: ChannelRepository;
    ravRepo: RAVRepository;
    pendingSubRAVRepo: PendingSubRAVRepository;
  } {
    const backendEnv = process.env.PAYMENTKIT_BACKEND as 'sql' | 'memory' | undefined;
    const backend: 'sql' | 'memory' = backendEnv === 'sql' ? 'sql' : 'memory';
    const connectionString =
      backend === 'sql'
        ? process.env.PAYMENTKIT_CONNECTION_STRING ||
          process.env.SUPABASE_DB_URL ||
          process.env.DATABASE_URL
        : undefined;

    const tablePrefix = process.env.PAYMENTKIT_TABLE_PREFIX || 'nuwa_';
    const autoMigrate =
      process.env.PAYMENTKIT_AUTO_MIGRATE === 'true' || process.env.NODE_ENV !== 'production';

    let channelRepo: ChannelRepository;
    let ravRepo: RAVRepository;
    let pendingSubRAVRepo: PendingSubRAVRepository;
    if (backend === 'sql') {
      // Defer Pool creation to runtime via dynamic import factory
      // eslint-disable-next-line @typescript-eslint/no-var-requires
      const sql = require('../../storage/sql/index');
      const repos = sql.createSqlStorageRepositories({
        connectionString: connectionString!,
        tablePrefix,
        autoMigrate,
        allowUnsafeAutoMigrateInProd:
          process.env.PAYMENTKIT_ALLOW_UNSAFE_AUTO_MIGRATE_IN_PROD === 'true',
      });
      // If it returned a Promise (ESM dynamic factory), this will be a thenable
      if (typeof repos.then === 'function') {
        throw new Error(
          'createSqlStorageRepositories() is async; use the async factory to build ExpressPaymentKit or pre-create repositories and inject'
        );
      }
      ({ channelRepo, ravRepo, pendingSubRAVRepo } = repos);
    } else {
      ({ channelRepo, ravRepo, pendingSubRAVRepo } = createStorageRepositories({
        backend: 'memory',
        tablePrefix,
        autoMigrate,
      }));
    }

    return { channelRepo, ravRepo, pendingSubRAVRepo };
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
        debug: this.config.debug,
      },
      payeeClient: this.payeeClient,
      rateProvider: this.rateProvider,
      claimScheduler: this.claimScheduler,
      processor: this.processor,
      ravRepository: this.ravRepo,
      channelRepo: this.channelRepo,
      pendingSubRAVStore: this.pendingSubRAVRepo,
    };

    // 1. Discovery endpoint (well-known, completely public - no middleware)
    // This is handled directly to maintain compatibility and avoid billing
    this.router.get('/.well-known/nuwa-payment/info', (req: Request, res: Response) => {
      this.handleDiscoveryRequest(req, res);
    });

    // 2. Register built-in handlers with prefix using the single BillableRouter
    registerHandlersWithBillableRouter(BuiltInApiHandlers, apiContext, this.billableRouter, {
      pathPrefix: basePath,
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
      basePath: this.config.basePath || '/payment-channel',
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

        // Step 2: Authentication (based on rule configuration)
        const needAuth = rule?.authRequired ?? false;
        const needAdminAuth = rule?.adminOnly ?? false;

        if (needAuth || needAdminAuth) {
          await this.performDIDAuth(req, res);
        }

        if (needAdminAuth) {
          await this.performAdminAuth(req, res);
        }

        // Step 3: Apply billing middleware (for all registered routes)
        if (rule) {
          // Create response adapter for framework-agnostic billing
          const resAdapter = this.createResponseAdapter(res);

          // Use new unified billing API
          const billingContext = await this.middleware.handleWithNewAPI(req);

          if (!billingContext) {
            // No billing rule matched - proceed without payment

            return next();
          }

          // Unified handling for both pre-flight and post-flight
          res.locals.billingContext = billingContext;

          // If processor marked a protocol-level error, short-circuit and return immediately
          // Note: This is the error short-circuit from the pre-processing stage. The header writing in onHeaders is the unified exit for the settlement stage.
          if (billingContext.state?.error) {
            const err = billingContext.state.error as { code: string; message?: string };
            const status = this.mapErrorCodeToHttpStatus(err.code);
            const headerValue = this.buildProtocolErrorHeader(req, err);
            this.ensureExposeHeader(res);
            res.setHeader(HttpPaymentCodec.getHeaderName(), headerValue);

            return res.status(status).json({
              success: false,
              error: { code: err.code, message: err.message, httpStatus: status },
            });
          }

          let billingCompleted = false;
          let headerWritten = false;
          const isStreaming = isStreamingRequest(req as any, rule as any);

          // Intercept headers to write payment header synchronously
          // Note: This is the unified exit for the settlement stage, which writes the success/failure payment header; it is complementary to the pre-processing error short-circuit rather than redundant.
          if (!isStreaming) {
            onHeaders(res, () => {
              if (headerWritten) return;
              headerWritten = true;
              try {
                this.ensureExposeHeader(res);
                const raw = (res.locals as any).usage;
                const units =
                  typeof raw === 'number' && Number.isFinite(raw) && raw >= 0 ? Math.floor(raw) : 0;
                this.middleware.settleBillingSync(billingContext, units, resAdapter);
              } catch (error) {}
            });
          }

          // Inject in-band payment frame for streaming just before end (best-effort)
          if (isStreaming) {
            const originalEnd = (res as any).end?.bind(res) || res.end;
            (res as any).end = (...args: any[]) => {
              try {
                if (!billingCompleted) {
                  const raw = (res.locals as any).usage;
                  const units =
                    typeof raw === 'number' && Number.isFinite(raw) && raw >= 0
                      ? Math.floor(raw)
                      : 0;
                  const settled: any = this.processor.settle(billingContext, units);
                  if (!headerWritten) {
                    try {
                      this.ensureExposeHeader(res);
                      if (settled?.state?.headerValue) {
                        res.setHeader('X-Payment-Channel-Data', settled.state.headerValue);
                      }
                    } catch {}
                  }
                  try {
                    const headerValue: string | undefined = settled?.state?.headerValue;
                    if (headerValue) {
                      const ct = (res.getHeader('Content-Type') as string) || '';
                      const sseObj = { nuwa_payment_header: headerValue };
                      const ndjsonObj = { __nuwa_payment_header__: headerValue };
                      const frameSSE = `data: ${JSON.stringify(sseObj)}\n\n`;
                      const frameNDJSON = JSON.stringify(ndjsonObj) + '\n';
                      if (ct.includes('text/event-stream')) {
                        try {
                          (res as any).write?.(frameSSE);
                        } catch {}
                      } else if (ct.includes('application/x-ndjson')) {
                        try {
                          (res as any).write?.(frameNDJSON);
                        } catch {}
                      } else {
                        // For other content types, do not force insertion to avoid breaking protocol
                        this.logger.warn('Streaming response with unsupported content type:', ct);
                      }
                    }
                  } catch {}
                  if (settled?.state?.unsignedSubRav) {
                    this.middleware.persistBilling(settled).catch(() => {});
                  }
                  billingCompleted = true;
                }
              } catch {}
              return originalEnd(...args);
            };
          }

          // Persist after response is sent
          res.on('finish', async () => {
            if (billingCompleted) return;
            billingCompleted = true;
            try {
              if (isStreaming) {
                // Streaming: settle at finish and persist
                const raw = (res.locals as any).usage;
                const units =
                  typeof raw === 'number' && Number.isFinite(raw) && raw >= 0 ? Math.floor(raw) : 0;
                const settled = this.processor.settle(billingContext, units) as any;
                if (!headerWritten) {
                  // Trailers are not widely supported; rely on polling/in-band. Still expose header if possible.
                  try {
                    this.ensureExposeHeader(res);
                    if (settled?.state?.headerValue) {
                      res.setHeader('X-Payment-Channel-Data', settled.state.headerValue);
                    }
                  } catch {}
                }
                if (settled?.state?.unsignedSubRav) {
                  await this.middleware.persistBilling(settled);
                }
              } else if (billingContext.state?.unsignedSubRav) {
                await this.middleware.persistBilling(billingContext);
              }
            } catch (error) {}
          });

          return next();
        } else {
        }

        next();
      } catch (error) {
        res.status(500).json({
          error: 'Payment processing failed',
          details: error instanceof Error ? error.message : String(error),
        });
      }
    };
  }

  /**
   * Ensure CORS exposes our payment header to browsers so client JS can read it.
   */
  private ensureExposeHeader(res: Response) {
    const headerName = HttpPaymentCodec.getHeaderName();
    const existing = res.getHeader('Access-Control-Expose-Headers');
    const current = (
      Array.isArray(existing) ? existing.join(',') : (existing as string | undefined) || ''
    )
      .split(',')
      .map(s => s.trim())
      .filter(Boolean);
    if (!current.map(s => s.toLowerCase()).includes(headerName.toLowerCase())) {
      current.push(headerName);
      res.setHeader('Access-Control-Expose-Headers', current.join(', '));
    }
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
      throw new Error(
        `Admin authorization failed: ${error instanceof Error ? error.message : String(error)}`
      );
    }
  }

  /**
   * Perform DID authentication using DIDAuthV1 scheme
   */
  private async performDIDAuth(req: express.Request, res: express.Response): Promise<void> {
    const AUTH_SCHEME = 'DIDAuthV1';
    const HEADER_PREFIX = `${AUTH_SCHEME} `;

    try {
      const authHeader = req.headers.authorization;

      if (this.config.debug) {
        console.log(
          `🔐 performDIDAuth: Authorization present=${!!authHeader}, startsWithDIDAuthV1=${
            !!authHeader && authHeader.startsWith(HEADER_PREFIX)
          }`
        );
      }

      if (!authHeader || !authHeader.startsWith(HEADER_PREFIX)) {
        throw new Error('Missing or invalid Authorization header');
      }

      // Perform cryptographic verification via Nuwa Identity Kit
      const verifyResult = await DIDAuth.v1.verifyAuthHeader(authHeader, VDRRegistry.getInstance());

      if (!verifyResult.ok) {
        throw new Error(verifyResult.error);
      }

      // Success path: extract signer DID and set it on the request
      (req as any).didInfo = {
        did: verifyResult.signedObject.signature.signer_did,
        keyId: verifyResult.signedObject.signature.key_id,
      };
    } catch (error) {
      throw new Error(
        `DID authentication failed: ${error instanceof Error ? error.message : String(error)}`
      );
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
      throw new Error(
        'Cannot create anonymous paid endpoints: pricing > 0 requires authRequired to be true or undefined'
      );
    }

    // Rule: If adminOnly is true and authRequired is explicitly false, throw error
    if (options.adminOnly && options.authRequired === false) {
      throw new Error(
        'Cannot create admin endpoints without authentication: adminOnly requires authRequired to be true or undefined'
      );
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
      },
    };
  }

  /**
   * Map PaymentError code to HTTP status code (shared by preProcess short-circuit)
   */
  private mapErrorCodeToHttpStatus(code?: string): number {
    return httpStatusFor(code as PaymentErrorCode);
  }

  /**
   * Build protocol error header consistently from request headers and error
   */
  private buildProtocolErrorHeader(req: Request, err: { code: string; message?: string }): string {
    let clientTxRef: string | undefined;
    try {
      const headerValueIn = HttpPaymentCodec.extractPaymentHeader(req.headers as any);
      if (headerValueIn) {
        const payload = HttpPaymentCodec.parseRequestHeader(headerValueIn);
        clientTxRef = payload.clientTxRef;
      }
    } catch {}
    return HttpPaymentCodec.buildResponseHeader({
      error: { code: err.code, message: err.message },
      clientTxRef,
      version: 1,
    } as any);
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
export async function createExpressPaymentKit(
  config: ExpressPaymentKitOptions
): Promise<ExpressPaymentKit> {
  // Validate configuration
  if (!config.signer) {
    throw new Error('Service private key (signer) is required');
  }

  // Get service DID from signer
  const serviceDid = await (async () => {
    const maybe = (config.signer as any).getDid?.();
    return typeof maybe?.then === 'function' ? await maybe : maybe;
  })();

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

  // Create default ContractRateProvider
  const rateProvider = new ContractRateProvider(contract, 30_000);

  // Optionally prebuild SQL storage repos via dynamic import so callers don't need changes
  let prebuiltStorage:
    | {
        channelRepo: ChannelRepository;
        ravRepo: RAVRepository;
        pendingSubRAVRepo: PendingSubRAVRepository;
      }
    | undefined;

  try {
    const backendEnv = process.env.PAYMENTKIT_BACKEND as 'sql' | 'memory' | undefined;
    if (backendEnv === 'sql') {
      const connectionString =
        process.env.PAYMENTKIT_CONNECTION_STRING ||
        process.env.SUPABASE_DB_URL ||
        process.env.DATABASE_URL;
      if (!connectionString) {
        throw new Error(
          'PAYMENTKIT_BACKEND=sql requires PAYMENTKIT_CONNECTION_STRING (or SUPABASE_DB_URL / DATABASE_URL)'
        );
      }
      const { createSqlStorageRepositories }: any = await import('../../storage/sql/index');
      prebuiltStorage = await createSqlStorageRepositories({
        connectionString,
        tablePrefix: process.env.PAYMENTKIT_TABLE_PREFIX || 'nuwa_',
        autoMigrate:
          process.env.PAYMENTKIT_AUTO_MIGRATE === 'true' || process.env.NODE_ENV !== 'production',
        allowUnsafeAutoMigrateInProd:
          process.env.PAYMENTKIT_ALLOW_UNSAFE_AUTO_MIGRATE_IN_PROD === 'true',
      });
    }
  } catch (e) {
    // If SQL setup fails, surface meaningful error; otherwise continue with memory backend
    if ((process.env.PAYMENTKIT_BACKEND as string) === 'sql') {
      throw e;
    }
  }

  return new ExpressPaymentKitImpl(
    config,
    {
      contract,
      signer: config.signer,
      didResolver: vdrRegistry,
      rateProvider,
      serviceDid,
    },
    prebuiltStorage
  );
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
