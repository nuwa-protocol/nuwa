import express, { Request, Response } from 'express';
import { type ExpressPaymentKit } from '@nuwa-ai/payment-kit/express';
import { ProviderManager } from './core/providerManager.js';
import { AuthManager, AuthConfig } from './core/authManager.js';
import { RouteHandler } from './core/routeHandler.js';
import { PathValidator } from './core/pathValidator.js';
import type { DIDInfo } from './types/index.js';

// Legacy type exports for backward compatibility
export type NonStreamHandler = (req: Request) => Promise<{ status: number; body: any; usage?: { cost?: number } }>;
export type UsageQueryHandler = (req: Request, res: Response) => Promise<void>;

// Re-export types from core modules for backward compatibility
export { UpstreamMeta, ProxyResult } from './core/routeHandler.js';
export { PathValidationResult } from './core/pathValidator.js';
export { AuthConfig, AuthResult } from './core/authManager.js';

/**
 * Gateway configuration options
 */
export interface GatewayConfig extends AuthConfig {
  // Additional gateway-specific options can be added here
}

/**
 * Initialize PaymentKit and register routes using the new modular architecture
 * Maintains backward compatibility with the existing API
 */
export async function initPaymentKitAndRegisterRoutes(
  app: express.Application, 
  deps?: {
  handleNonStreamLLM?: NonStreamHandler;
  registerUsageHandler?: UsageQueryHandler;
  },
  config?: GatewayConfig
): Promise<ExpressPaymentKit> {
  
  // Initialize core managers
  const providerManager = ProviderManager.getInstance();
  const authManager = new AuthManager();
  
  // Initialize authentication and PaymentKit
  const authConfig: AuthConfig = {
    serviceId: config?.serviceId || 'llm-gateway',
    defaultAssetId: config?.defaultAssetId || process.env.DEFAULT_ASSET_ID || '0x3::gas_coin::RGas',
    defaultPricePicoUSD: config?.defaultPricePicoUSD || '0',
    adminDid: config?.adminDid || process.env.ADMIN_DID?.split(',') || [],
    debug: config?.debug ?? (process.env.DEBUG === 'true'),
    claim: config?.claim || {
      minClaimAmount: BigInt(process.env.MIN_CLAIM_AMOUNT || '100000000'),
      maxConcurrentClaims: Number(process.env.MAX_CONCURRENT_CLAIMS || '5'),
      maxRetries: Number(process.env.MAX_RETRIES || '3'),
      retryDelayMs: Number(process.env.RETRY_DELAY_MS || '60000'),
      requireHubBalance: true,
    },
    roochOptions: config?.roochOptions || {
      rpcUrl: process.env.ROOCH_NODE_URL,
      network: process.env.ROOCH_NETWORK || 'test',
    },
  };

  const paymentKit = await authManager.initialize(authConfig);

  // Initialize providers
  const providerResult = providerManager.initializeProviders();
  console.log(`🔌 Initialized ${providerResult.registered.length} providers`);

  // Create route handler
  const routeHandler = new RouteHandler({
    providerManager,
    authManager,
    skipAuth: false, // Use real auth in production
  });

  // Create provider-specific routes
  createProviderRouters(paymentKit, routeHandler, providerManager);

  // Create provider status route
  authManager.createStatusRoute(() => getProviderStatus(providerManager));

  // Register PaymentKit routes
  authManager.registerRoutes(app);
  
  return paymentKit;
}

/**
 * Get provider status for the status endpoint
 */
function getProviderStatus(providerManager: ProviderManager) {
  const providers = providerManager.list().map(name => {
    const config = providerManager.get(name)!;
      return {
        name,
        requiresApiKey: config.requiresApiKey,
        supportsNativeUsdCost: config.supportsNativeUsdCost,
        status: 'registered'
      };
    });

    const envStatus = {
      // Only show relevant environment variables
      OPENROUTER_BASE_URL: !!process.env.OPENROUTER_BASE_URL,
      LITELLM_BASE_URL: !!process.env.LITELLM_BASE_URL,
      OPENAI_BASE_URL: !!process.env.OPENAI_BASE_URL,
      PRICING_OVERRIDES: !!process.env.PRICING_OVERRIDES,
    };

    // Show which providers are available vs configured
    const allProviders = ['openrouter', 'openai', 'litellm'];
  const availableProviders = providerManager.list();
    const unavailableProviders = allProviders.filter(p => !availableProviders.includes(p));

  return {
        registered: providers,
        available: availableProviders,
        unavailable: unavailableProviders,
        environment: envStatus,
  };
}

/**
 * Create provider routers using the new modular architecture
 */
function createProviderRouters(
  paymentKit: ExpressPaymentKit, 
  routeHandler: RouteHandler, 
  providerManager: ProviderManager
): void {
  // Get all registered providers
  const availableProviders = providerManager.list();

  console.log(`🔌 Registering routes for providers: ${availableProviders.join(', ')}`);
  console.log(`📝 Available providers count: ${availableProviders.length}`);

  if (availableProviders.length === 0) {
    console.warn('⚠️  No providers available for route registration!');
    console.warn('   This means no provider routes will be registered.');
    console.warn('   Check provider initialization in ProviderManager');
  }

  // 1. Register Legacy routes first (highest priority)
  const legacyHandler = (req: Request, res: Response) => {
    // Mark as legacy route in access log
    if ((res as any).locals?.accessLog) {
      (res as any).locals.accessLog.is_legacy_route = true;
    }
    return routeHandler.handleProviderRequest(req, res, 'openrouter');
  };

  paymentKit.post('/api/v1/chat/completions', { pricing: { type: 'FinalCost' } }, legacyHandler, 'legacy.chat.completions');
  paymentKit.post('/api/v1/completions', { pricing: { type: 'FinalCost' } }, legacyHandler, 'legacy.completions');
  paymentKit.get('/api/v1/models', { pricing: { type: 'FinalCost' } }, legacyHandler, 'legacy.models');
  
  console.log('✅ Registered legacy routes: /api/v1/*');

  // 2. Register wildcard routes for each provider using correct Express path patterns
  availableProviders.forEach((providerName, index) => {
    console.log(`📋 Registering routes for provider ${index + 1}/${availableProviders.length}: ${providerName}`);
    
    const providerHandler = (req: Request, res: Response) => {
      return routeHandler.handleProviderRequest(req, res, providerName);
    };
    
    // Use RegExp directly to avoid path-to-regexp interpretation issues
    const pathPattern = new RegExp(`^\\/${providerName}\\/(.*)$`);
    
    try {
      // Register using native ExpressPaymentKit methods
      paymentKit.post(pathPattern, { pricing: { type: 'FinalCost' } }, providerHandler, `${providerName}.post.wildcard`);
      paymentKit.get(pathPattern, { pricing: { type: 'FinalCost' } }, providerHandler, `${providerName}.get.wildcard`);
      
      console.log(`   ✅ Successfully registered routes for ${providerName}`);
    } catch (error) {
      console.error(`   ❌ Failed to register routes for ${providerName}:`, error);
    }
  });
}

// Legacy exports for backward compatibility
export { ProviderManager } from './core/providerManager.js';
export { AuthManager } from './core/authManager.js';
export { RouteHandler } from './core/routeHandler.js';
export { PathValidator } from './core/pathValidator.js';

/**
 * Create a test instance of the gateway for testing purposes
 * This allows testing without PaymentKit integration
 */
export function createTestGateway(config?: {
  skipAuth?: boolean;
  enabledProviders?: string[];
}): {
  providerManager: ProviderManager;
  authManager: AuthManager;
  routeHandler: RouteHandler;
} {
  const providerManager = ProviderManager.createTestInstance();
  const authManager = AuthManager.createTestInstance();
  
  // Initialize providers for testing
  providerManager.initializeProviders({ 
    skipEnvCheck: true 
  });
  
  // Filter to enabled providers if specified
  if (config?.enabledProviders) {
    const allProviders = providerManager.list();
    allProviders.forEach(providerName => {
      if (!config.enabledProviders!.includes(providerName)) {
        providerManager.unregister(providerName);
    }
  });
}

  const routeHandler = new RouteHandler({
    providerManager,
    authManager,
    skipAuth: config?.skipAuth ?? true,
  });
  
  return {
    providerManager,
    authManager,
    routeHandler,
  };
}

// End of file - all functionality has been moved to the new modular architecture
