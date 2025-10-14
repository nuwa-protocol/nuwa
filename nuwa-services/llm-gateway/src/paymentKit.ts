import * as express from 'express';
import { Request, Response } from 'express';
import { IdentityKit, DebugLogger } from '@nuwa-ai/identity-kit';
import { createExpressPaymentKitFromEnv, type ExpressPaymentKit } from '@nuwa-ai/payment-kit/express';

// Bridge to existing non-stream LLM handler
import { Router } from 'express';
import SupabaseService from './database/supabase.js';
import OpenRouterService from './services/openrouter.js';
import LiteLLMService from './services/litellm.js';
import { OpenAIProvider } from './providers/openai.js';
import { providerRegistry, ProviderRegistry } from './providers/registry.js';
import { UsagePolicy } from './billing/usagePolicy.js';
import { parse } from 'url';
import type { DIDInfo } from './types/index.js';

// Placeholder: you can wire to existing handlers or inline logic
// Expectation: handleNonStreamLLM returns { status: number; body: any; usage?: { cost?: number } }
export type NonStreamHandler = (req: Request) => Promise<{ status: number; body: any; usage?: { cost?: number } }>;
export type UsageQueryHandler = (req: Request, res: Response) => Promise<void>;

interface UpstreamMeta {
  upstream_name: string;
  upstream_method: string;
  upstream_path: string;
  upstream_status_code?: number;
  upstream_duration_ms?: number;
  upstream_request_id?: string;
  upstream_headers_subset?: Record<string, any>;
  upstream_streamed?: boolean;
  upstream_bytes?: number;
  upstream_cost_usd?: number;
}

interface ProxyResult {
  status: number;
  body?: any;
  error?: string;
  usageUsd?: number;
  meta: UpstreamMeta;
}

export async function initPaymentKitAndRegisterRoutes(app: express.Application, deps?: {
  handleNonStreamLLM?: NonStreamHandler;
  registerUsageHandler?: UsageQueryHandler;
}): Promise<ExpressPaymentKit> {
  
  const env = await IdentityKit.bootstrap({
    method: 'rooch',
    vdrOptions: {
      rpcUrl: process.env.ROOCH_NODE_URL,
      network: process.env.ROOCH_NETWORK || 'test',
    },
  });

  const serviceKey = process.env.SERVICE_KEY;
  if (!serviceKey) throw new Error('SERVICE_KEY is required');
  await env.keyManager.importKeyFromString(serviceKey);

  const billing = await createExpressPaymentKitFromEnv(env as any, {
    serviceId: 'llm-gateway',
    defaultAssetId: process.env.DEFAULT_ASSET_ID || '0x3::gas_coin::RGas',
    defaultPricePicoUSD: '0',
    adminDid: process.env.ADMIN_DID?.split(',') || [],
    debug: process.env.DEBUG === 'true',
    claim: {
      minClaimAmount: BigInt(process.env.MIN_CLAIM_AMOUNT || '100000000'),
      maxConcurrentClaims: Number(process.env.MAX_CONCURRENT_CLAIMS || '5'),
      maxRetries: Number(process.env.MAX_RETRIES || '3'),
      retryDelayMs: Number(process.env.RETRY_DELAY_MS || '60000'),
      requireHubBalance: true,
    },
  });

  if (process.env.GLOBAL_DEBUG === 'true') {
    DebugLogger.setGlobalLevel('debug');
  }else{
    DebugLogger.setGlobalLevel('info');
  }

  // Initialize providers
  initializeProviders();

  // Create provider-specific routes
  createProviderRouters(billing);

  // Free: provider status route (no auth required for monitoring)
  billing.get('/providers/status', { pricing: '0', authRequired: false }, async (req: Request, res: Response) => {
    const providers = providerRegistry.list().map(name => {
      const config = providerRegistry.get(name)!;
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
    const availableProviders = providerRegistry.list();
    const unavailableProviders = allProviders.filter(p => !availableProviders.includes(p));

    res.json({
      success: true,
      data: {
        registered: providers,
        available: availableProviders,
        unavailable: unavailableProviders,
        environment: envStatus,
        registrationTime: new Date().toISOString(),
        note: 'New route structure: /{provider}/api/v1/* (e.g., /openai/api/v1/chat/completions)'
      }
    });
  }, 'providers.status');

  app.use(billing.router);
  return billing;
}

const supabaseService = new SupabaseService();
const openrouterProvider = new OpenRouterService();
const litellmProvider = new LiteLLMService();
const openaiProvider = new OpenAIProvider();

/**
 * Get API key for a provider using the registry
 * @param providerName Provider name
 * @returns API key string or null if provider doesn't require API key
 * @throws Error if provider not found or required API key not available
 */
const getProviderApiKey = (providerName: string): string | null => {
  return providerRegistry.getProviderApiKey(providerName);
};

/**
 * Create provider routers with simplified wildcard routing
 * Uses PaymentKit's pathRegex support for /${provider}/* patterns
 */
function createProviderRouters(billing: ExpressPaymentKit): void {
  // Get all registered providers
  const availableProviders = providerRegistry.list();

  console.log(`🔌 Registering routes for providers: ${availableProviders.join(', ')}`);

  // 1. Register Legacy routes first (highest priority)
  const legacyHandler = (req: Request, res: Response) => {
    // Mark as legacy route in access log
    if ((res as any).locals?.accessLog) {
      (res as any).locals.accessLog.is_legacy_route = true;
    }
    return handleProviderRequest(req, res, 'openrouter');
  };

  billing.post('/api/v1/chat/completions', { pricing: { type: 'FinalCost' } }, legacyHandler, 'legacy.chat.completions');
  billing.post('/api/v1/completions', { pricing: { type: 'FinalCost' } }, legacyHandler, 'legacy.completions');
  billing.get('/api/v1/models', { pricing: { type: 'FinalCost' } }, legacyHandler, 'legacy.models');
  
  console.log('✅ Registered legacy routes: /api/v1/*');

  // 2. Register wildcard routes for each provider using pathRegex
  availableProviders.forEach(providerName => {
    const providerHandler = (req: Request, res: Response) => {
      return handleProviderRequest(req, res, providerName);
    };
    
    // Create regex pattern for /${providerName}/* 
    const pathRegex = `^/${providerName}/.*`;
    
    // Register POST route with pathRegex
    registerProviderRouteWithRegex(billing, 'POST', pathRegex, providerHandler, `${providerName}.post.wildcard`);
    // Register GET route with pathRegex  
    registerProviderRouteWithRegex(billing, 'GET', pathRegex, providerHandler, `${providerName}.get.wildcard`);
    
    console.log(`✅ Registered wildcard routes for provider: ${providerName} (${pathRegex})`);
  });
}

/**
 * Register a provider route using pathRegex by directly manipulating BillableRouter rules
 * This extends PaymentKit to support our /${provider}/* routing pattern
 */
function registerProviderRouteWithRegex(
  billing: ExpressPaymentKit, 
  method: 'GET' | 'POST', 
  pathRegex: string, 
  handler: (req: Request, res: Response) => void,
  ruleId: string
): void {
  // First register the Express route with a wildcard pattern
  const expressPath = pathRegex.replace('^/', '/').replace('/.*', '/*');
  
  // Register with Express (for actual request handling)
  if (method === 'POST') {
    (billing as any).router.post(expressPath, handler);
  } else {
    (billing as any).router.get(expressPath, handler);  
  }
  
  // Then manually add a BillingRule with pathRegex to the BillableRouter
  const billableRouter = (billing as any).billableRouter;
  if (billableRouter && billableRouter.rules) {
    const rule = {
      id: ruleId,
      when: {
        pathRegex: pathRegex,
        method: method.toUpperCase(),
      },
      strategy: { type: 'FinalCost' },
      authRequired: true,
      adminOnly: false,
      paymentRequired: true,
    };
    
    // Insert before any default rules
    const firstDefaultIndex = billableRouter.rules.findIndex((r: any) => r.default);
    if (firstDefaultIndex >= 0) {
      billableRouter.rules.splice(firstDefaultIndex, 0, rule);
    } else {
      billableRouter.rules.push(rule);
    }
    
    console.log(`📋 Added pathRegex billing rule: ${ruleId} -> ${pathRegex}`);
  } else {
    console.warn(`⚠️ Could not access BillableRouter rules for ${ruleId}`);
  }
}

/**
 * Extract and validate the upstream path from the request path
 * New logic: /:provider/$path → provider_url/$path (with security validation)
 * @param req Express request object
 * @param providerName Name of the provider
 * @returns Cleaned path for upstream forwarding
 */
function getUpstreamPath(req: Request, providerName: string): string {
  const fullPath = req.path;
  
  // Get provider configuration for validation
  const providerConfig = providerRegistry.get(providerName);
  if (!providerConfig) {
    throw new Error(`Provider '${providerName}' not found in registry`);
  }
  
  // For legacy routes (/api/v1/*), keep the full path
  if (fullPath.startsWith('/api/v1/')) {
    return fullPath;
  }
  
  // For debug routes (/debug/:provider/$path), extract $path
  if (fullPath.startsWith('/debug/')) {
    const debugMatch = fullPath.match(/^\/debug\/[^\/]+(\/.*)$/);
    if (debugMatch) {
      const extractedPath = debugMatch[1];
      
      // Validate path against allowed paths
      if (!isPathAllowed(extractedPath, providerConfig.allowedPaths)) {
        throw new Error(`Path '${extractedPath}' is not allowed for provider '${providerName}'`);
      }
      
      return extractedPath;
    }
  }
  
  // For provider routes (/:provider/$path), extract $path
  const expectedPrefix = `/${providerName}/`;
  if (fullPath.startsWith(expectedPrefix)) {
    const extractedPath = fullPath.substring(expectedPrefix.length - 1); // Keep leading slash
    
    // Validate path against allowed paths
    if (!isPathAllowed(extractedPath, providerConfig.allowedPaths)) {
      throw new Error(`Path '${extractedPath}' is not allowed for provider '${providerName}'`);
    }
    
    return extractedPath;
  }
  
  // Fallback: return the path as-is
  console.warn(`Unexpected path format: ${fullPath} for provider: ${providerName}`);
  return fullPath;
}

/**
 * Check if a path is allowed for a provider
 * @param path The path to check
 * @param allowedPaths Array of allowed path patterns
 * @returns true if path is allowed
 */
function isPathAllowed(path: string, allowedPaths: string[]): boolean {
  return allowedPaths.some(allowedPath => {
    // Support exact match and wildcard patterns
    if (allowedPath.endsWith('*')) {
      const prefix = allowedPath.slice(0, -1);
      return path.startsWith(prefix);
    } else {
      return path === allowedPath;
    }
  });
}

/**
 * Unified request handler for both streaming and non-streaming requests
 */
async function handleProviderRequest(req: Request, res: Response, providerName: string): Promise<void> {
  const isStream = !!(req.body && req.body.stream);

  if (!isStream) {
    // Non-stream request
    const result = await handleNonStreamRequest(req, providerName);
    (res as any).locals.upstream = result.meta;
    const totalCostUSD = result.usageUsd ?? 0;
    const pico = Math.round(Number(totalCostUSD) * 1e12);
    (res as any).locals.usage = pico;
    
    if (result.error) {
      const errorResponse = result.body || { success: false, error: result.error };
      res.status(result.status).json(errorResponse);
      return;
    }
    res.status(result.status).json(result.body);
    return;
  }

  // Stream request
  await handleStreamRequest(req, res, providerName);
}

/**
 * Handle non-streaming requests for a specific provider
 */
async function handleNonStreamRequest(req: Request, providerName: string): Promise<ProxyResult> {
  const didInfo = (req as any).didInfo as DIDInfo;
  if (!didInfo?.did) {
    return { 
      status: 401, 
      error: 'Unauthorized', 
      meta: {
        upstream_name: providerName, 
        upstream_method: req.method, 
        upstream_path: getUpstreamPath(req, providerName)
      } 
    } as ProxyResult;
  }

  const provider = providerRegistry.getProvider(providerName);
  if (!provider) {
    return { 
      status: 404, 
      error: `Provider '${providerName}' not found`, 
      meta: {
        upstream_name: providerName, 
        upstream_method: req.method, 
        upstream_path: getUpstreamPath(req, providerName)
      } 
    } as ProxyResult;
  }

  const meta: UpstreamMeta = {
    upstream_name: providerName,
    upstream_method: req.method,
    upstream_path: getUpstreamPath(req, providerName),
    upstream_streamed: false,
  };

  // Set provider info in access log
  if ((req as any).res?.locals?.accessLog) {
    (req as any).res.locals.accessLog.provider = providerName;
  }

  // Prepare request data using provider-specific logic
  let finalRequestData = getRequestData(req);
  if (finalRequestData && provider.prepareRequestData) {
    finalRequestData = provider.prepareRequestData(finalRequestData, false);
  }

  // Get API key from registry
  let apiKey: string | null;
  try {
    apiKey = getProviderApiKey(providerName);
  } catch (error) {
    console.error(`Failed to get API key for provider '${providerName}': ${(error as Error).message}`);
    return { 
      status: 404, 
      error: `Provider configuration error: ${(error as Error).message}`, 
      meta 
    };
  }

  const started = Date.now();
  const upstreamPath = getUpstreamPath(req, providerName);
  const resp: any = await provider.forwardRequest(apiKey, upstreamPath, req.method, finalRequestData, false);
  meta.upstream_duration_ms = Date.now() - started;

  if (!resp) {
    meta.upstream_status_code = 502;
    return { status: 502, error: 'Failed to process request', meta };
  }
  
  if ('error' in resp) {
    meta.upstream_status_code = resp.status || 500;
    const errorBody = {
      success: false,
      error: resp.error,
      upstream_error: (resp as any).details || null,
      status_code: resp.status || 500,
    };
    return { status: resp.status || 500, error: resp.error, body: errorBody, meta };
  }

  meta.upstream_status_code = resp.status;
  
  // Extract useful headers for monitoring
  const hdrs = (resp as any).headers || {};
  meta.upstream_headers_subset = {
    'x-usage': hdrs['x-usage'],
    'x-ratelimit-limit': hdrs['x-ratelimit-limit'],
    'x-ratelimit-remaining': hdrs['x-ratelimit-remaining'],
    'x-request-id': hdrs['x-request-id'],
  };
  
  // Set request ID if available
  meta.upstream_request_id = hdrs['x-request-id'] || (resp as any).requestId;

  const responseData = provider.parseResponse(resp);
  
  // Calculate response size
  const responseStr = JSON.stringify(responseData);
  meta.upstream_bytes = Buffer.byteLength(responseStr, 'utf8');
  
  // Calculate cost using pricing system
  const model = finalRequestData?.model || 'unknown';
  const providerCostUsd = provider.extractProviderUsageUsd ? provider.extractProviderUsageUsd(resp) : undefined;
  const pricingResult = UsagePolicy.processNonStreamResponse(model, responseData, providerCostUsd);
  
  // Set cost in meta
  meta.upstream_cost_usd = pricingResult?.costUsd;
  
  return {
    status: resp.status,
    body: responseData,
    usageUsd: pricingResult?.costUsd,
    meta
  };
}

/**
 * Handle streaming requests for a specific provider  
 */
async function handleStreamRequest(req: Request, res: Response, providerName: string): Promise<void> {
  const didInfo = (req as any).didInfo as DIDInfo;
  if (!didInfo?.did) {
    res.status(401).json({ success: false, error: 'Unauthorized' });
    return;
  }

  const provider = providerRegistry.getProvider(providerName);
  if (!provider) {
    res.status(404).json({ success: false, error: `Provider '${providerName}' not found` });
    return;
  }

  // Set provider info in access log
  if ((res as any).locals?.accessLog) {
    (res as any).locals.accessLog.provider = providerName;
  }

  // Prepare request data using provider-specific logic
  const baseBody = getRequestData(req) ? { ...(req.body || {}), stream: true } : undefined;
  let requestData: any;
  
  if (baseBody && provider.prepareRequestData) {
    requestData = provider.prepareRequestData(baseBody, true);
  } else {
    requestData = baseBody;
  }

  let apiKey: string | null;
  try {
    apiKey = getProviderApiKey(providerName);
  } catch (error) {
    console.error(`Failed to get API key for provider '${providerName}': ${(error as Error).message}`);
    res.status(404).json({ 
      success: false, 
      error: `Provider configuration error: ${(error as Error).message}` 
    });
    return;
  }

  res.setHeader('Content-Type', 'text/event-stream');
  res.setHeader('Cache-Control', 'no-cache');
  res.setHeader('Connection', 'keep-alive');
  res.setHeader('Transfer-Encoding', 'chunked');

  const meta: UpstreamMeta = {
    upstream_name: providerName,
    upstream_method: 'POST',
    upstream_path: getUpstreamPath(req, providerName),
    upstream_streamed: true,
  };

  const started = Date.now();
  try {
    const upstreamPath = getUpstreamPath(req, providerName);
    const upstream = await provider.forwardRequest(apiKey, upstreamPath, 'POST', requestData, true);
    meta.upstream_duration_ms = Date.now() - started;

    if (!upstream) {
      meta.upstream_status_code = 502;
      (res as any).locals.upstream = meta;
      if (!res.headersSent) res.status(502).end();
      return;
    }

    if ('error' in upstream) {
      meta.upstream_status_code = upstream.status || 500;
      (res as any).locals.upstream = meta;
      if (!res.headersSent) res.status(upstream.status || 500).json({ success: false, error: upstream.error });
      return;
    }

    meta.upstream_status_code = 200;
    (res as any).locals.upstream = meta;

    // Extract headers for monitoring
    const hdrs = (upstream as any).headers || {};
    meta.upstream_headers_subset = {
      'x-usage': hdrs['x-usage'],
      'x-ratelimit-limit': hdrs['x-ratelimit-limit'],
      'x-ratelimit-remaining': hdrs['x-ratelimit-remaining'],
      'x-request-id': hdrs['x-request-id'],
    };
    meta.upstream_request_id = hdrs['x-request-id'] || (upstream as any).requestId;

    // Process stream response with usage tracking
    const streamProcessor = UsagePolicy.createStreamProcessor(
      req.body?.model || 'unknown',
      provider.extractProviderUsageUsd ? provider.extractProviderUsageUsd(upstream) : undefined
    );

    let totalBytes = 0;
    upstream.data.on('data', (chunk: Buffer) => {
      const chunkStr = chunk.toString();
      totalBytes += chunk.length;
      streamProcessor.processChunk(chunkStr);
      res.write(chunk);
    });

    upstream.data.on('end', () => {
      const finalCost = streamProcessor.getFinalCost();
      
      // Update meta with final metrics
      meta.upstream_bytes = totalBytes;
      meta.upstream_cost_usd = finalCost?.costUsd;
      
      if (finalCost) {
        const picoUsd = Math.round(Number(finalCost.costUsd || 0) * 1e12);
        (res as any).locals.usage = picoUsd;
        
        // Set access log info
        if ((res as any).locals?.accessLog) {
          (res as any).locals.accessLog.total_cost_usd = finalCost.costUsd;
          (res as any).locals.accessLog.usage_source = finalCost.source;
          (res as any).locals.accessLog.input_tokens = finalCost.usage?.promptTokens;
          (res as any).locals.accessLog.output_tokens = finalCost.usage?.completionTokens;
        }
      }
      res.end();
    });

    upstream.data.on('error', (error: Error) => {
      console.error('Stream error:', error);
      if (!res.headersSent) res.status(502).end();
    });

  } catch (e: any) {
    meta.upstream_duration_ms = Date.now() - started;
    meta.upstream_status_code = 500;
    (res as any).locals.upstream = meta;
    console.error('Error in stream proxy:', e);
    if (!res.headersSent) res.status(500).end();
  }
}

/**
 * Initialize and register all providers based on environment configuration
 */
function initializeProviders(): void {
  console.log('🚀 [Provider] Starting provider initialization...');
  
  const registeredProviders: string[] = [];
  const skippedProviders: string[] = [];

  // Provider configurations with their required environment variables
  const providerConfigs = [
    {
      name: 'openrouter',
      instance: openrouterProvider,
      requiresApiKey: true,
      supportsNativeUsdCost: true,
      apiKeyEnvVar: 'OPENROUTER_API_KEY',
      baseUrl: process.env.OPENROUTER_BASE_URL || 'https://openrouter.ai',
      allowedPaths: [
        '/api/v1/chat/completions',
        '/api/v1/completions', 
        '/api/v1/models',
        '/api/v1/embeddings',
        '/api/v1/*' // Allow all /api/v1/* paths for flexibility
      ],
      requiredEnvVars: ['OPENROUTER_API_KEY'],
      optionalEnvVars: ['OPENROUTER_BASE_URL'],
      defaultCheck: () => !!process.env.OPENROUTER_API_KEY
    },
    {
      name: 'litellm', 
      instance: litellmProvider,
      requiresApiKey: true,
      supportsNativeUsdCost: true,
      apiKeyEnvVar: 'LITELLM_API_KEY',
      baseUrl: process.env.LITELLM_BASE_URL || 'https://litellm.example.com',
      allowedPaths: [
        '/chat/completions',
        '/completions',
        '/models',
        '/embeddings',
        '/v1/*', // LiteLLM might use /v1/* paths
        '/*' // LiteLLM proxy can be configured with various paths
      ],
      requiredEnvVars: ['LITELLM_BASE_URL', 'LITELLM_API_KEY'],
      optionalEnvVars: [],
      defaultCheck: () => !!process.env.LITELLM_BASE_URL && !!process.env.LITELLM_API_KEY
    },
    {
      name: 'openai',
      instance: openaiProvider,
      requiresApiKey: true,
      supportsNativeUsdCost: false,
      apiKeyEnvVar: 'OPENAI_API_KEY',
      baseUrl: process.env.OPENAI_BASE_URL || 'https://api.openai.com',
      allowedPaths: [
        '/v1/chat/completions',
        '/v1/completions',
        '/v1/models', 
        '/v1/embeddings',
        '/v1/images/generations',
        '/v1/audio/transcriptions',
        '/v1/audio/translations',
        '/v1/*' // Allow all OpenAI v1 API paths
      ],
      requiredEnvVars: ['OPENAI_API_KEY'],
      optionalEnvVars: ['OPENAI_BASE_URL'],
      defaultCheck: () => !!process.env.OPENAI_API_KEY
    }
  ];

  for (const config of providerConfigs) {
    // Check if provider should be registered
    const missingRequired = config.requiredEnvVars.filter(envVar => !process.env[envVar]);
    const shouldRegister = missingRequired.length === 0 && config.defaultCheck();

    if (shouldRegister) {
      // Resolve API key if required
      let apiKey: string | undefined;
      if (config.requiresApiKey) {
        if (!config.apiKeyEnvVar) {
          console.error(`Provider ${config.name} requires API key but apiKeyEnvVar not specified. Skipping registration.`);
          skippedProviders.push(`${config.name} (missing apiKeyEnvVar configuration)`);
          continue;
        }
        
        apiKey = process.env[config.apiKeyEnvVar];
        if (!apiKey) {
          console.error(`API key not found for provider ${config.name}: Environment variable '${config.apiKeyEnvVar}' is not set`);
          skippedProviders.push(`${config.name} (missing ${config.apiKeyEnvVar})`);
          continue;
        }
      }

      providerRegistry.register({
        name: config.name,
        instance: config.instance,
        requiresApiKey: config.requiresApiKey,
        supportsNativeUsdCost: config.supportsNativeUsdCost,
        apiKey: apiKey, // Directly pass the resolved API key
        baseUrl: config.baseUrl,
        allowedPaths: config.allowedPaths,
      });
      registeredProviders.push(config.name);
      
      console.log(`✅ [Provider] Registered ${config.name}`);
      
      // Log configuration status for each provider
      const configStatus = [];
      if (config.requiresApiKey) configStatus.push(`API key: ${config.apiKeyEnvVar}`);
      config.requiredEnvVars.forEach(envVar => {
        if (envVar !== config.apiKeyEnvVar) configStatus.push(`${envVar}: configured`);
      });
      config.optionalEnvVars.forEach(envVar => {
        if (process.env[envVar]) configStatus.push(`${envVar}: custom`);
        else configStatus.push(`${envVar}: default`);
      });
      
      if (configStatus.length > 0) {
        console.log(`   ${config.name}: ${configStatus.join(', ')}`);
      }
    } else {
      skippedProviders.push(`${config.name} (missing: ${missingRequired.join(', ')})`);
    }
  }

  // Log results
  console.log('🔌 Registered providers:', registeredProviders.join(', '));
  console.log('📝 All providers require manual API key import');
  
  if (skippedProviders.length > 0) {
    console.log('⏭️  Skipped providers:', skippedProviders.join(', '));
    console.log('💡 Configure required environment variables to enable these providers');
  }

  if (registeredProviders.length === 0) {
    console.warn('⚠️  No providers registered! Please check your environment configuration.');
  }

  // Log current environment status in debug mode
  if (process.env.DEBUG === 'true') {
    logEnvironmentStatus();
  }
}

/**
 * Log environment status for debugging
 */
function logEnvironmentStatus(): void {
  const envStatus = {
    // OpenRouter - no special env vars needed, uses user's own API keys
    OPENROUTER_BASE_URL: process.env.OPENROUTER_BASE_URL || 'https://openrouter.ai',
    
    // LiteLLM - needs to know where the LiteLLM proxy is running
    LITELLM_BASE_URL: process.env.LITELLM_BASE_URL || '❌ Not configured',
    
    // OpenAI - uses official API, no special config needed
    OPENAI_BASE_URL: process.env.OPENAI_BASE_URL || 'https://api.openai.com/v1',
    
    // Pricing configuration
    PRICING_OVERRIDES: process.env.PRICING_OVERRIDES ? '✅ Custom pricing set' : '❌ Using defaults',
  };

  console.log('🔧 Environment Status:');
  Object.entries(envStatus).forEach(([key, value]) => {
    console.log(`   ${key}: ${value}`);
  });
  console.log('');
}

function getRequestData(req: Request): any | undefined {
  const method = req.method;
  return ['GET', 'DELETE'].includes(method) ? undefined : req.body;
}

// Default usage handler
async function defaultUsageHandler(req: Request, res: Response): Promise<void> {
  res.json({
    success: true,
    message: 'Usage endpoint - implement your usage tracking logic here'
  });
}
