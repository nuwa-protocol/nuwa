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
 * Result of provider validation
 */
interface ProviderValidationResult {
  success: boolean;
  error?: string;
  statusCode?: number;
  provider?: LLMProvider;
  apiKey?: string | null;
  pathResult?: PathValidationResult;
  didInfo?: DIDInfo | null;
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
   * Validate provider request (common logic for both streaming and non-streaming)
   */
  private validateProviderRequest(req: Request, providerName: string): ProviderValidationResult {
    // Validate authentication
    if (!this.skipAuth) {
      const authResult = this.authManager.validateDIDAuth(req);
      if (!authResult.success) {
        return {
          success: false,
          error: authResult.error || 'Unauthorized',
          statusCode: 401
        };
      }
    }

    const didInfo = this.authManager.extractDIDInfo(req);
    
    // Get provider configuration and validate path
    const providerConfig = this.providerManager.get(providerName);
    if (!providerConfig) {
      return {
        success: false,
        error: `Provider '${providerName}' not found`,
        statusCode: 404
      };
    }

    const pathResult = PathValidator.validatePath(req, providerName, providerConfig);
    if (pathResult.error) {
      return {
        success: false,
        error: pathResult.error,
        statusCode: 400,
        pathResult
      };
    }
    
    // Require DID authentication for all routes (both legacy and provider routes need billing)
    if (!this.skipAuth && !didInfo?.did) {
      return {
        success: false,
        error: 'Unauthorized',
        statusCode: 401,
        pathResult,
        didInfo
      };
    }

    const provider = this.providerManager.getProvider(providerName);
    if (!provider) {
      return {
        success: false,
        error: `Provider '${providerName}' not found`,
        statusCode: 404,
        pathResult,
        didInfo
      };
    }

    // Get API key from provider manager
    let apiKey: string | null;
    try {
      apiKey = this.providerManager.getProviderApiKey(providerName);
    } catch (error) {
      console.error(`Failed to get API key for provider '${providerName}': ${(error as Error).message}`);
      return {
        success: false,
        error: `Provider configuration error: ${(error as Error).message}`,
        statusCode: 404,
        pathResult,
        didInfo
      };
    }

    return {
      success: true,
      provider,
      apiKey,
      pathResult,
      didInfo
    };
  }

  /**
   * Handle a unified request (both streaming and non-streaming)
   */
  async handleProviderRequest(req: Request, res: Response, providerName: string): Promise<void> {
    // Perform common validation
    const validation = this.validateProviderRequest(req, providerName);
    if (!validation.success) {
      const errorResponse = { success: false, error: validation.error };
      res.status(validation.statusCode!).json(errorResponse);
      return;
    }

    const isStream = !!(req.body && req.body.stream);

    if (!isStream) {
      // Non-stream request
      const result = await this.handleNonStreamRequest(req, providerName, validation);
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
    await this.handleStreamRequest(req, res, providerName, validation);
  }

  /**
   * Handle non-streaming requests for a specific provider
   */
  async handleNonStreamRequest(req: Request, providerName: string, validation: ProviderValidationResult): Promise<ProxyResult> {
    const { provider, apiKey, pathResult } = validation;

    const meta: UpstreamMeta = {
      upstream_name: providerName,
      upstream_method: req.method,
      upstream_path: pathResult!.path,
      upstream_streamed: false,
    };

    // Use the new high-level executeRequest API
    const started = Date.now();
    const upstreamPath = pathResult!.path;
    const requestData = this.getRequestData(req);
    
    const executeResult = await provider!.executeRequest(apiKey!, upstreamPath, req.method, requestData);
    meta.upstream_duration_ms = Date.now() - started;

    // Handle executeRequest result
    if (!executeResult.success) {
      meta.upstream_status_code = executeResult.statusCode || 500;
      const errorBody = {
        success: false,
        error: executeResult.error,
        upstream_error: executeResult.details || null,
        status_code: executeResult.statusCode || 500,
      };
      return { 
        status: executeResult.statusCode || 500, 
        error: executeResult.error || 'Unknown error', 
        body: errorBody, 
        meta 
      };
    }

    meta.upstream_status_code = executeResult.statusCode || 200;
    
    // Extract useful headers for monitoring (if rawResponse is available)
    if (executeResult.rawResponse) {
      const hdrs = executeResult.rawResponse.headers || {};
      meta.upstream_headers_subset = {
        'x-usage': hdrs['x-usage'],
        'x-ratelimit-limit': hdrs['x-ratelimit-limit'],
        'x-ratelimit-remaining': hdrs['x-ratelimit-remaining'],
        'x-request-id': hdrs['x-request-id'],
      };
      
      // Set request ID if available
      meta.upstream_request_id = hdrs['x-request-id'] || (executeResult.rawResponse as any).requestId;
    }
    
    // Calculate response size
    if (executeResult.response) {
      const responseStr = JSON.stringify(executeResult.response);
      meta.upstream_bytes = Buffer.byteLength(responseStr, 'utf8');
    }
    
    // Set cost in meta (now provided by executeRequest)
    meta.upstream_cost_usd = executeResult.cost?.costUsd;
    
    return {
      status: executeResult.statusCode || 200,
      body: executeResult.response,
      usageUsd: executeResult.cost?.costUsd,
      meta
    };
  }

  /**
   * Handle streaming requests for a specific provider  
   */
  async handleStreamRequest(req: Request, res: Response, providerName: string, validation: ProviderValidationResult): Promise<void> {
    const { provider, apiKey, pathResult } = validation;

    res.setHeader('Content-Type', 'text/event-stream');
    res.setHeader('Cache-Control', 'no-cache');
    res.setHeader('Connection', 'keep-alive');
    res.setHeader('Transfer-Encoding', 'chunked');

    const meta: UpstreamMeta = {
      upstream_name: providerName,
      upstream_method: 'POST',
      upstream_path: pathResult!.path,
      upstream_streamed: true,
    };

    const started = Date.now();
    try {
      const upstreamPath = pathResult!.path;
      // Construct data with stream: true
      const data = { ...(req.body || {}), stream: true };
      
      // ⭐️ Use the new simplified executeStreamRequest API - pass res directly
      const result = await provider!.executeStreamRequest(apiKey!, upstreamPath, 'POST', data, res);
      
      meta.upstream_duration_ms = Date.now() - started;

      if (!result.success) {
        meta.upstream_status_code = result.statusCode;
        (res as any).locals.upstream = meta;
        // Stream handling is already done by executeStreamRequest, just log the error
        console.error(`Stream request failed: ${result.error}`);
        return;
      }

      // ⭐️ Super simple - directly use returned values to update meta
      meta.upstream_status_code = result.statusCode;
      meta.upstream_bytes = result.totalBytes;
      meta.upstream_cost_usd = result.cost?.costUsd;
      
      // Extract headers for monitoring (if rawResponse is available)
      if (result.rawResponse) {
        const hdrs = result.rawResponse.headers || {};
        meta.upstream_headers_subset = {
          'x-usage': hdrs['x-usage'],
          'x-ratelimit-limit': hdrs['x-ratelimit-limit'],
          'x-ratelimit-remaining': hdrs['x-ratelimit-remaining'],
          'x-request-id': hdrs['x-request-id'],
        };
        meta.upstream_request_id = hdrs['x-request-id'];
      }
      
      (res as any).locals.upstream = meta;
      
      // Set billing information
      if (result.cost) {
        const picoUsd = Math.round(Number(result.cost.costUsd || 0) * 1e12);
        (res as any).locals.usage = picoUsd;
      }

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
