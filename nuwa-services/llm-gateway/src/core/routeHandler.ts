import { Request, Response } from 'express';
import { LLMProvider } from '../providers/LLMProvider.js';
import { ProviderManager } from './providerManager.js';
import { PathValidator, PathValidationResult } from './pathValidator.js';
import { AuthManager } from './authManager.js';
import { CostCalculator } from '../billing/usage/CostCalculator.js';
import { providerRegistry } from '../providers/registry.js';
import type { DIDInfo } from '../types/index.js';

/**
 * Upstream metadata for monitoring and logging
 */
export interface UpstreamMeta {
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

/**
 * Result of a provider request
 */
export interface ProxyResult {
  status: number;
  body?: any;
  error?: string;
  usageUsd?: number;
  meta: UpstreamMeta;
}

/**
 * Configuration for route handling
 */
export interface RouteHandlerConfig {
  providerManager: ProviderManager;
  authManager: AuthManager;
  skipAuth?: boolean; // For testing
}

/**
 * Handles HTTP requests to providers with authentication and billing
 * Separated from PaymentKit integration for better testability
 */
export class RouteHandler {
  private providerManager: ProviderManager;
  private authManager: AuthManager;
  private skipAuth: boolean;

  constructor(config: RouteHandlerConfig) {
    this.providerManager = config.providerManager;
    this.authManager = config.authManager;
    this.skipAuth = config.skipAuth || false;
  }

  /**
   * Handle a unified request (both streaming and non-streaming)
   */
  async handleProviderRequest(req: Request, res: Response, providerName: string): Promise<void> {
    const isStream = !!(req.body && req.body.stream);

    if (!isStream) {
      // Non-stream request
      const result = await this.handleNonStreamRequest(req, providerName);
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
    await this.handleStreamRequest(req, res, providerName);
  }

  /**
   * Handle non-streaming requests for a specific provider
   */
  async handleNonStreamRequest(req: Request, providerName: string): Promise<ProxyResult> {
    // Validate authentication
    if (!this.skipAuth) {
      const authResult = this.authManager.validateDIDAuth(req);
      if (!authResult.success) {
        return { 
          status: 401, 
          error: authResult.error || 'Unauthorized', 
          meta: {
            upstream_name: providerName, 
            upstream_method: req.method, 
            upstream_path: req.path
          } 
        } as ProxyResult;
      }
    }

    const didInfo = this.authManager.extractDIDInfo(req);
    
    // Get provider configuration and validate path
    const providerConfig = this.providerManager.get(providerName);
    if (!providerConfig) {
      return { 
        status: 404, 
        error: `Provider '${providerName}' not found`, 
        meta: {
          upstream_name: providerName, 
          upstream_method: req.method, 
          upstream_path: req.path
        } 
      } as ProxyResult;
    }

    const pathResult = PathValidator.validatePath(req, providerName, providerConfig);
    if (pathResult.error) {
      return { 
        status: 400, 
        error: pathResult.error, 
        meta: {
          upstream_name: providerName, 
          upstream_method: req.method, 
          upstream_path: pathResult.path
        } 
      } as ProxyResult;
    }

    // Require DID authentication for all routes (both legacy and provider routes need billing)
    if (!this.skipAuth && !didInfo?.did) {
      return { 
        status: 401, 
        error: 'Unauthorized', 
        meta: {
          upstream_name: providerName, 
          upstream_method: req.method, 
          upstream_path: pathResult.path
        } 
      } as ProxyResult;
    }

    const provider = this.providerManager.getProvider(providerName);
    if (!provider) {
      return { 
        status: 404, 
        error: `Provider '${providerName}' not found`, 
        meta: {
          upstream_name: providerName, 
          upstream_method: req.method, 
          upstream_path: pathResult.path
        } 
      } as ProxyResult;
    }

    const meta: UpstreamMeta = {
      upstream_name: providerName,
      upstream_method: req.method,
      upstream_path: pathResult.path,
      upstream_streamed: false,
    };

    // Prepare request data using provider-specific logic
    let finalRequestData = this.getRequestData(req);
    if (finalRequestData && provider.prepareRequestData) {
      finalRequestData = provider.prepareRequestData(finalRequestData, false);
    }

    // Get API key from provider manager
    let apiKey: string | null;
    try {
      apiKey = this.providerManager.getProviderApiKey(providerName);
    } catch (error) {
      console.error(`Failed to get API key for provider '${providerName}': ${(error as Error).message}`);
      return { 
        status: 404, 
        error: `Provider configuration error: ${(error as Error).message}`, 
        meta 
      };
    }

    const started = Date.now();
    const upstreamPath = pathResult.path;
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
    
    // Calculate cost using provider-specific logic
    const model = finalRequestData?.model || 'unknown';
    const providerCostUsd = provider.extractProviderUsageUsd ? provider.extractProviderUsageUsd(resp) : undefined;
    
    // Get provider-specific usage extractor
    const registryProvider = providerRegistry.getProvider(providerName);
    let pricingResult = null;
    
    if (registryProvider?.createUsageExtractor) {
      const extractor = registryProvider.createUsageExtractor();
      const usage = extractor.extractFromResponseBody(responseData);
      if (usage) {
        pricingResult = CostCalculator.calculateRequestCost(model, providerCostUsd, usage);
        console.log(`[RouteHandler] Used ${providerName} extractor for non-stream response`);
      }
    }
    
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
  async handleStreamRequest(req: Request, res: Response, providerName: string): Promise<void> {
    // Validate authentication
    if (!this.skipAuth) {
      const authResult = this.authManager.validateDIDAuth(req);
      if (!authResult.success) {
        res.status(401).json({ success: false, error: authResult.error || 'Unauthorized' });
        return;
      }
    }

    const didInfo = this.authManager.extractDIDInfo(req);
    
    // Get provider configuration and validate path
    const providerConfig = this.providerManager.get(providerName);
    if (!providerConfig) {
      res.status(404).json({ success: false, error: `Provider '${providerName}' not found` });
      return;
    }

    const pathResult = PathValidator.validatePath(req, providerName, providerConfig);
    if (pathResult.error) {
      res.status(400).json({ 
        success: false, 
        error: pathResult.error 
      });
      return;
    }
    
    // Require DID authentication for all routes (both legacy and provider routes need billing)
    if (!this.skipAuth && !didInfo?.did) {
      res.status(401).json({ success: false, error: 'Unauthorized' });
      return;
    }

    const provider = this.providerManager.getProvider(providerName);
    if (!provider) {
      res.status(404).json({ success: false, error: `Provider '${providerName}' not found` });
      return;
    }

    // Prepare request data using provider-specific logic
    const baseBody = this.getRequestData(req) ? { ...(req.body || {}), stream: true } : undefined;
    let requestData: any;
    
    if (baseBody && provider.prepareRequestData) {
      requestData = provider.prepareRequestData(baseBody, true);
    } else {
      requestData = baseBody;
    }

    let apiKey: string | null;
    try {
      apiKey = this.providerManager.getProviderApiKey(providerName);
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
      upstream_path: pathResult.path,
      upstream_streamed: true,
    };

    const started = Date.now();
    try {
      const upstreamPath = pathResult.path;
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

      // Process stream response with provider-specific usage tracking
      const model = req.body?.model || 'unknown';
      const providerCostUsd = provider.extractProviderUsageUsd ? provider.extractProviderUsageUsd(upstream) : undefined;
      
      // Get provider-specific stream processor
      const registryProvider = providerRegistry.getProvider(providerName);
      let streamProcessor = null;
      
      if (registryProvider?.createStreamProcessor) {
        streamProcessor = registryProvider.createStreamProcessor(model, providerCostUsd);
        console.log(`[RouteHandler] Created ${providerName} stream processor`);
      }

      let totalBytes = 0;
      upstream.data.on('data', (chunk: Buffer) => {
        const chunkStr = chunk.toString();
        totalBytes += chunk.length;
        
        // Process chunk with provider-specific processor if available
        if (streamProcessor) {
          streamProcessor.processChunk(chunkStr);
        }
        
        res.write(chunk);
      });

      upstream.data.on('end', () => {
        let finalCost = null;
        
        // Get final cost from provider-specific processor if available
        if (streamProcessor) {
          finalCost = streamProcessor.getFinalCost();
        }
        
        // Update meta with final metrics
        meta.upstream_bytes = totalBytes;
        meta.upstream_cost_usd = finalCost?.costUsd;
        
        if (finalCost) {
          const picoUsd = Math.round(Number(finalCost.costUsd || 0) * 1e12);
          (res as any).locals.usage = picoUsd;
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
   * Extract request data based on HTTP method
   */
  private getRequestData(req: Request): any | undefined {
    const method = req.method;
    return ['GET', 'DELETE'].includes(method) ? undefined : req.body;
  }

  /**
   * Create a test instance with custom configuration
   */
  static createTestInstance(config: Partial<RouteHandlerConfig> = {}): RouteHandler {
    return new RouteHandler({
      providerManager: config.providerManager || ProviderManager.createTestInstance(),
      authManager: config.authManager || AuthManager.createTestInstance(),
      skipAuth: config.skipAuth ?? true, // Default to skip auth in tests
    });
  }
}
