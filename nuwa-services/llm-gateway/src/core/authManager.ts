import express, { Request, Response, NextFunction } from 'express';
import { IdentityKit, DebugLogger } from '@nuwa-ai/identity-kit';
import {
  createExpressPaymentKitFromEnv,
  type ExpressPaymentKit,
} from '@nuwa-ai/payment-kit/express';
import type { DIDInfo } from '../types/index.js';

/**
 * Authentication configuration options
 */
export interface AuthConfig {
  serviceId?: string;
  defaultAssetId?: string;
  defaultPricePicoUSD?: string;
  adminDid?: string[];
  debug?: boolean;
  claim?: {
    minClaimAmount?: bigint;
    maxConcurrentClaims?: number;
    maxRetries?: number;
    retryDelayMs?: number;
    requireHubBalance?: boolean;
  };
  roochOptions?: {
    rpcUrl?: string;
    network?: string;
  };
}

/**
 * Authentication result for testing
 */
export interface AuthResult {
  success: boolean;
  didInfo?: DIDInfo;
  error?: string;
}

/**
 * Manages DID authentication and PaymentKit integration
 * Separated from provider logic to enable independent testing
 */
export class AuthManager {
  private paymentKit: ExpressPaymentKit | null = null;
  private identityEnv: any = null;
  private initialized = false;

  /**
   * Initialize the authentication system with PaymentKit
   */
  async initialize(config: AuthConfig = {}): Promise<ExpressPaymentKit> {
    if (this.initialized && this.paymentKit) {
      return this.paymentKit;
    }

    // Bootstrap Identity Kit
    this.identityEnv = await IdentityKit.bootstrap({
      method: 'rooch',
      vdrOptions: {
        rpcUrl: config.roochOptions?.rpcUrl || process.env.ROOCH_NODE_URL,
        network: config.roochOptions?.network || process.env.ROOCH_NETWORK || 'test',
      },
    });

    // Import service key
    const serviceKey = process.env.SERVICE_KEY;
    if (!serviceKey) {
      throw new Error('SERVICE_KEY is required for authentication');
    }
    await this.identityEnv.keyManager.importKeyFromString(serviceKey);

    // Create PaymentKit instance
    this.paymentKit = await createExpressPaymentKitFromEnv(this.identityEnv as any, {
      serviceId: config.serviceId || 'llm-gateway',
      defaultAssetId:
        config.defaultAssetId || process.env.DEFAULT_ASSET_ID || '0x3::gas_coin::RGas',
      defaultPricePicoUSD: config.defaultPricePicoUSD || '0',
      adminDid: config.adminDid || process.env.ADMIN_DID?.split(',') || [],
      debug: config.debug ?? process.env.DEBUG === 'true',
      claim: {
        minClaimAmount:
          config.claim?.minClaimAmount || BigInt(process.env.MIN_CLAIM_AMOUNT || '100000000'),
        maxConcurrentClaims:
          config.claim?.maxConcurrentClaims || Number(process.env.MAX_CONCURRENT_CLAIMS || '5'),
        maxRetries: config.claim?.maxRetries || Number(process.env.MAX_RETRIES || '3'),
        retryDelayMs: config.claim?.retryDelayMs || Number(process.env.RETRY_DELAY_MS || '60000'),
        requireHubBalance: config.claim?.requireHubBalance ?? true,
      },
    });

    // Configure debug logging
    if (process.env.GLOBAL_DEBUG === 'true') {
      DebugLogger.setGlobalLevel('debug');
    } else {
      DebugLogger.setGlobalLevel('info');
    }

    this.initialized = true;
    return this.paymentKit;
  }

  /**
   * Get the PaymentKit instance
   */
  getPaymentKit(): ExpressPaymentKit | null {
    return this.paymentKit;
  }

  /**
   * Check if authentication is initialized
   */
  isInitialized(): boolean {
    return this.initialized && this.paymentKit !== null;
  }

  /**
   * Extract DID info from request (for testing without full PaymentKit)
   */
  extractDIDInfo(req: Request): DIDInfo | null {
    const didInfo = (req as any).didInfo as DIDInfo;
    return didInfo || null;
  }

  /**
   * Validate DID authentication (for testing)
   * This is a simplified version that checks if DID exists
   */
  validateDIDAuth(req: Request): AuthResult {
    const didInfo = this.extractDIDInfo(req);

    if (!didInfo?.did) {
      return {
        success: false,
        error: 'Unauthorized: No DID found in request',
      };
    }

    return {
      success: true,
      didInfo,
    };
  }

  /**
   * Create authentication middleware that can be bypassed for testing
   */
  createAuthMiddleware(options: { skipAuth?: boolean } = {}) {
    return (req: Request, res: Response, next: NextFunction) => {
      if (options.skipAuth) {
        // For testing: inject a mock DID
        (req as any).didInfo = { did: 'test:did:12345' };
        return next();
      }

      // In production, PaymentKit handles authentication
      // This middleware is mainly for testing scenarios
      const authResult = this.validateDIDAuth(req);
      if (!authResult.success) {
        return res.status(401).json({
          success: false,
          error: authResult.error,
        });
      }

      next();
    };
  }

  /**
   * Register routes with PaymentKit
   */
  registerRoutes(app: express.Application): void {
    if (!this.paymentKit) {
      throw new Error('AuthManager not initialized. Call initialize() first.');
    }

    app.use(this.paymentKit.router);
  }

  /**
   * Create a provider status route (no auth required)
   */
  createStatusRoute(getProviderStatus: () => any) {
    if (!this.paymentKit) {
      throw new Error('AuthManager not initialized. Call initialize() first.');
    }

    return this.paymentKit.get(
      '/providers/status',
      { pricing: '0', authRequired: false },
      async (req: Request, res: Response) => {
        const status = getProviderStatus();
        res.json({
          success: true,
          data: {
            ...status,
            registrationTime: new Date().toISOString(),
            note: 'New route structure: /{provider}/v1/* or /{provider}/api/v1/* (e.g., /openai/v1/chat/completions, /openrouter/api/v1/chat/completions)',
          },
        });
      },
      'providers.status'
    );
  }

  /**
   * Reset authentication state (useful for testing)
   */
  reset(): void {
    this.paymentKit = null;
    this.identityEnv = null;
    this.initialized = false;
  }

  /**
   * Create a test instance without PaymentKit initialization
   */
  static createTestInstance(): AuthManager {
    const instance = new AuthManager();
    // Mark as initialized but without actual PaymentKit for testing
    instance.initialized = true;
    return instance;
  }
}
