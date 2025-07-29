import express, { Router, RequestHandler, Request, Response, NextFunction } from 'express';
import { BillableRouter } from './BillableRouter';
import { HttpBillingMiddleware } from '../../middlewares/http/HttpBillingMiddleware';
import { UsdBillingEngine } from '../../billing/usd-engine';
import { ContractRateProvider } from '../../billing/rate/contract';
import { PaymentChannelPayeeClient } from '../../client/PaymentChannelPayeeClient';
import type { StrategyConfig } from '../../billing/types';
import type { RateProvider } from '../../billing/rate/types';
import type { SignerInterface, DIDResolver } from '@nuwa-ai/identity-kit';
import type { IPaymentChannelContract } from '../../contracts/IPaymentChannelContract';

/**
 * Simple payee configuration for auto-creating PayeeClient
 */
export interface SimplePayeeConfig {
  /** Payee DID */
  did: string;
  /** Key manager implementing SignerInterface */
  keyManager: SignerInterface;
  /** Optional RPC URL (defaults to env.ROOCH_NODE_URL) */
  rpcUrl?: string;
  /** Optional contract address */
  contractAddress?: string;
}

/**
 * DID authentication configuration
 */
export interface DIDAuthConfig {
  /** Enable DID authentication (default: true) */
  enabled?: boolean;
  /** Header scheme for DID auth (default: 'DIDAuthV1') */
  headerScheme?: string;
}

/**
 * Configuration for creating ExpressBillingKit
 */
export interface ExpressBillingKitConfig {
  /** Service identifier */
  serviceId: string;
  
  /** Simple payee configuration (auto-creates PayeeClient) */
  payee?: SimplePayeeConfig;
  
  /** Pre-configured PayeeClient (alternative to payee) */
  payeeClient?: PaymentChannelPayeeClient;
  
  /** Custom rate provider (optional) */
  rateProvider?: RateProvider;
  
  /** Default asset ID for settlement */
  defaultAssetId?: string;
  
  /** Default price in picoUSD when no rule matches */
  defaultPricePicoUSD?: string | bigint;
  
  /** DID authentication configuration */
  didAuth?: DIDAuthConfig;
  
  /** Debug logging */
  debug?: boolean;
}

/**
 * Express Billing Kit interface
 */
export interface ExpressBillingKit {
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
}

/**
 * Implementation of ExpressBillingKit
 */
class ExpressBillingKitImpl implements ExpressBillingKit {
  public readonly router: Router;
  private readonly billableRouter: BillableRouter;
  private readonly middleware: HttpBillingMiddleware;
  private readonly config: ExpressBillingKitConfig;

  constructor(
    config: ExpressBillingKitConfig,
    payeeClient: PaymentChannelPayeeClient,
    rateProvider: RateProvider
  ) {
    this.config = config;
    
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
        if (this.config.didAuth?.enabled !== false) {
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
   * Perform DID authentication (simplified implementation)
   */
  private async performDIDAuth(req: express.Request, res: express.Response): Promise<void> {
    // TODO: Implement actual DID authentication
    // For now, just check if Authorization header exists
    const authHeader = req.headers.authorization;
    const scheme = this.config.didAuth?.headerScheme || 'DIDAuthV1';
    
    if (!authHeader || !authHeader.startsWith(scheme)) {
      // For development, we'll allow requests without proper DID auth
      // In production, this should throw an error
      if (this.config.debug) {
        console.warn('⚠️ DID authentication skipped (debug mode)');
      }
      return;
    }

    // Extract and validate DID auth token
    // This is a placeholder - real implementation would:
    // 1. Parse the auth token
    // 2. Verify the signature
    // 3. Set req.didInfo with verified information
    console.log('🔐 DID authentication placeholder');
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
}

/**
 * Create an ExpressBillingKit instance
 */
export async function createExpressBillingKit(config: ExpressBillingKitConfig): Promise<ExpressBillingKit> {
  // Validate configuration
  if (!config.payee && !config.payeeClient) {
    throw new Error('Either payee or payeeClient must be provided');
  }

  if (config.payee && config.payeeClient) {
    console.warn('Both payee and payeeClient provided, using payeeClient');
  }

  // Get or create PayeeClient
  let payeeClient: PaymentChannelPayeeClient;
  if (config.payeeClient) {
    payeeClient = config.payeeClient;
  } else if (config.payee) {
    payeeClient = await createPayeeClientFromConfig(config.payee);
  } else {
    throw new Error('Invalid configuration: neither payee nor payeeClient provided');
  }

  // Get or create RateProvider
  let rateProvider: RateProvider;
  if (config.rateProvider) {
    rateProvider = config.rateProvider;
  } else {
    // Create default ContractRateProvider
    const contract = (payeeClient as any).contract;
    if (!contract) {
      throw new Error('PayeeClient contract is required for default ContractRateProvider');
    }
    rateProvider = new ContractRateProvider(contract, 30_000);
  }

  return new ExpressBillingKitImpl(config, payeeClient, rateProvider);
}

/**
 * Create PayeeClient from simple configuration
 */
async function createPayeeClientFromConfig(payeeConfig: SimplePayeeConfig): Promise<PaymentChannelPayeeClient> {
  // This is a simplified implementation
  // In a real implementation, you would:
  // 1. Create the appropriate contract instance based on the chain
  // 2. Set up proper DID resolver
  // 3. Configure storage options
  
  throw new Error('Auto-creation of PayeeClient from simple config not yet implemented. Please provide a pre-configured payeeClient.');
} 