import express, { Router, RequestHandler, Request, Response, NextFunction } from 'express';
import { BillableRouter } from './BillableRouter';
import { HttpBillingMiddleware } from '../../middlewares/http/HttpBillingMiddleware';
import { UsdBillingEngine } from '../../billing/usd-engine';
import { ContractRateProvider } from '../../billing/rate/contract';
import { PaymentChannelPayeeClient } from '../../client/PaymentChannelPayeeClient';
import { RoochPaymentChannelContract } from '../../rooch/RoochPaymentChannelContract';
import { MemoryChannelRepository } from '../../storage';
import { DIDAuth, VDRRegistry, RoochVDR } from '@nuwa-ai/identity-kit';
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
  /** Enable DID authentication (default: true) */
  didAuth?: boolean;
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

  constructor(
    config: ExpressPaymentKitOptions,
    payeeClient: PaymentChannelPayeeClient,
    rateProvider: RateProvider
  ) {
    this.config = config;
    this.payeeClient = payeeClient;
    
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
      // Skip billing for admin and health routes
      if (req.path.startsWith('/admin') || req.path === '/health') {
        return next();
      }

      try {
        // Step 1: DID Authentication (if enabled)
        if (this.config.didAuth !== false) {
          await this.performDIDAuth(req as express.Request, res as express.Response);
        }

        // Step 2: Apply billing middleware
        const billingMiddleware = this.middleware.createExpressMiddleware();
        await new Promise<void>((resolve, reject) => {
          billingMiddleware(req as any, res as any, (error?: any) => {
            if (error) reject(error);
            else resolve();
          });
        });

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
    return this;
  }

  post(path: string, pricing: bigint | string | StrategyConfig, handler: RequestHandler, ruleId?: string): this {
    this.billableRouter.post(path, pricing, handler, ruleId);
    return this;
  }

  put(path: string, pricing: bigint | string | StrategyConfig, handler: RequestHandler, ruleId?: string): this {
    this.billableRouter.put(path, pricing, handler, ruleId);
    return this;
  }

  delete(path: string, pricing: bigint | string | StrategyConfig, handler: RequestHandler, ruleId?: string): this {
    this.billableRouter.delete(path, pricing, handler, ruleId);
    return this;
  }

  patch(path: string, pricing: bigint | string | StrategyConfig, handler: RequestHandler, ruleId?: string): this {
    this.billableRouter.patch(path, pricing, handler, ruleId);
    return this;
  }

  /**
   * Get recovery router for client data recovery
   */
  recoveryRouter(): Router {
    const router = express.Router();
    
    // GET /pending - Get pending SubRAV for a channel
    router.get('/pending', async (req: Request, res: Response) => {
      try {
        const channelId = req.headers['x-channel-id'] as string;
        const vmFragment = req.headers['x-vm-fragment'] as string;
        const signedNonce = req.headers['x-signed-nonce'] as string;

        if (!channelId || !vmFragment || !signedNonce) {
          return res.status(400).json({ 
            error: 'Missing required headers: x-channel-id, x-vm-fragment, x-signed-nonce' 
          });
        }

        // TODO: Verify signature of nonce
        // For now, just try to find pending SubRAV
        const subRav = await this.middleware.findPendingProposal(channelId, BigInt(0));
        
        if (subRav) {
          res.json({ subRav });
        } else {
          res.status(404).json({ error: 'No pending SubRAV found' });
        }
      } catch (error) {
        res.status(500).json({ 
          error: 'Failed to retrieve pending SubRAV',
          details: error instanceof Error ? error.message : String(error)
        });
      }
    });

    // GET /price/:assetId - Get current price for an asset
    router.get('/price/:assetId', async (req: Request, res: Response) => {
      try {
        const { assetId } = req.params;
        // TODO: Get price from rate provider
        // For now, return a placeholder
        res.json({ 
          assetId,
          priceUSD: '0.01',
          timestamp: Date.now()
        });
      } catch (error) {
        res.status(500).json({ 
          error: 'Failed to get asset price',
          details: error instanceof Error ? error.message : String(error)
        });
      }
    });

    return router;
  }

  /**
   * Get admin router for operations management
   */
  adminRouter(options?: { auth?: RequestHandler }): Router {
    const router = express.Router();

    // Apply auth middleware if provided
    if (options?.auth) {
      router.use(options.auth);
    }

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

  // Set up blockchain connection
  const rpcUrl = config.rpcUrl || process.env.ROOCH_NODE_URL || 'http://localhost:6767';
  const network = config.network || 'local';
  
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

  return new ExpressPaymentKitImpl(config, payeeClient, rateProvider);
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