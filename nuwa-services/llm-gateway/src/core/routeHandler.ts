import { Request, Response } from 'express';
import { LLMProvider } from '../providers/LLMProvider.js';
import { ProviderManager } from './providerManager.js';
import { PathValidator, PathValidationResult } from './pathValidator.js';
import { AuthManager } from './authManager.js';
import { CostCalculator } from '../billing/usage/CostCalculator.js';
import { PricingRegistry } from '../billing/pricing.js';
import { providerRegistry } from '../providers/registry.js';
import type { DIDInfo } from '../types/index.js';
import type { UsageInfo, PricingResult } from '../billing/pricing.js';
import type { ModelExtractor } from '../providers/BaseLLMProvider.js';

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
  // New fields for enhanced error tracking
  error_code?: string;
  error_type?: string;
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
  // Additional fields for access log
  usage?: UsageInfo;
  cost?: PricingResult;
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
          statusCode: 401,
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
        statusCode: 404,
      };
    }

    const pathResult = PathValidator.validatePath(req, providerName, providerConfig);
    if (pathResult.error) {
      return {
        success: false,
        error: pathResult.error,
        statusCode: 400,
        pathResult,
      };
    }

    // Require DID authentication for all routes (both legacy and provider routes need billing)
    if (!this.skipAuth && !didInfo?.did) {
      return {
        success: false,
        error: 'Unauthorized',
        statusCode: 401,
        pathResult,
        didInfo,
      };
    }

    const provider = this.providerManager.getProvider(providerName);
    if (!provider) {
      return {
        success: false,
        error: `Provider '${providerName}' not found`,
        statusCode: 404,
        pathResult,
        didInfo,
      };
    }

    // Get API key from provider manager
    let apiKey: string | null;
    try {
      apiKey = this.providerManager.getProviderApiKey(providerName);
    } catch (error) {
      console.error(
        `Failed to get API key for provider '${providerName}': ${(error as Error).message}`
      );
      return {
        success: false,
        error: `Provider configuration error: ${(error as Error).message}`,
        statusCode: 404,
        pathResult,
        didInfo,
      };
    }

    return {
      success: true,
      provider,
      apiKey,
      pathResult,
      didInfo,
    };
  }

  /**
   * Validate if a model is supported for billing
   * @param providerName Provider name
   * @param model Model name from request
   * @param supportsNativeUsdCost Whether provider supports native USD cost
   * @returns Validation result with error message if invalid
   */
  private validateModelPricing(
    providerName: string,
    model: string | undefined,
    supportsNativeUsdCost: boolean
  ): { valid: boolean; error?: string } {
    if (!model) {
      return { valid: false, error: 'Model not specified in request' };
    }

    const pricingRegistry = PricingRegistry.getInstance();
    const isSupported = pricingRegistry.isModelSupported(
      providerName,
      model,
      supportsNativeUsdCost
    );

    if (!isSupported) {
      return {
        valid: false,
        error: `Model '${model}' is not supported. Please check available models.`,
      };
    }

    return { valid: true };
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

    // 使用统一的流式判断方法
    // 修复：正确访问validation对象中的provider和pathResult属性
    const isStream = this.extractStream(req, validation.provider!, validation.pathResult!.path);

    if (!isStream) {
      // Non-stream request
      const result = await this.handleNonStreamRequest(req, providerName, validation);
      (res as any).locals.upstream = result.meta;
      (res as any).locals.usageInfo = result.usage;
      (res as any).locals.costResult = result.cost;
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
  async handleNonStreamRequest(
    req: Request,
    providerName: string,
    validation: ProviderValidationResult
  ): Promise<ProxyResult> {
    const { provider, apiKey, pathResult } = validation;

    const meta: UpstreamMeta = {
      upstream_name: providerName,
      upstream_method: req.method,
      upstream_path: pathResult!.path,
      upstream_streamed: false,
    };

    // Extract model using new extraction method
    const model = this.extractModel(req, provider!, pathResult!.path);

    // Get provider config to check if it supports native USD cost
    const providerConfig = this.providerManager.get(providerName);

    // Validate model pricing before making upstream request
    const pricingValidation = this.validateModelPricing(
      providerName,
      model,
      providerConfig?.supportsNativeUsdCost || false
    );

    if (!pricingValidation.valid) {
      return {
        status: 400,
        error: pricingValidation.error!,
        body: {
          error: {
            message: pricingValidation.error,
            type: 'invalid_request_error',
            code: 'model_not_supported',
          },
        },
        meta,
      };
    }

    // Use the new high-level executeRequest API
    const started = Date.now();
    const upstreamPath = pathResult!.path;

    // Ensure request data includes the extracted model for Gemini path formatting
    // 修复：确保URL参数中的model信息被传递到请求数据中
    const requestData = this.getRequestData(req);
    let finalRequestData = requestData;

    if (model) {
      if (!finalRequestData) {
        finalRequestData = { model };
      } else if (typeof finalRequestData === 'object') {
        finalRequestData.model = model;
      }
    }

    const executeResult = await provider!.executeRequest(
      apiKey!,
      upstreamPath,
      req.method,
      finalRequestData
    );
    meta.upstream_duration_ms = Date.now() - started;

    // Handle executeRequest result
    if (!executeResult.success) {
      meta.upstream_status_code = executeResult.statusCode || 500;
      meta.error_code = executeResult.errorCode;
      meta.error_type = executeResult.errorType;
      meta.upstream_request_id = executeResult.upstreamRequestId;

      // Return original upstream error format for consistency with success responses
      // If we have the original error response, use it; otherwise fall back to wrapped format
      let errorBody: any;

      if (executeResult.details?.rawError && typeof executeResult.details.rawError === 'object') {
        // Use the original upstream error response
        errorBody = executeResult.details.rawError;
      } else {
        // Fallback to wrapped format if no original error available
        errorBody = {
          success: false,
          error: executeResult.error,
          upstream_error: executeResult.details || null,
          status_code: executeResult.statusCode || 500,
        };
      }

      return {
        status: executeResult.statusCode || 500,
        error: executeResult.error || 'Unknown error',
        body: errorBody,
        meta,
      };
    }

    meta.upstream_status_code = executeResult.statusCode || 200;
    meta.upstream_request_id = executeResult.upstreamRequestId;

    // Extract useful headers for monitoring (if rawResponse is available)
    if (executeResult.rawResponse) {
      const hdrs = executeResult.rawResponse.headers || {};
      meta.upstream_headers_subset = {
        'x-usage': hdrs['x-usage'],
        'x-ratelimit-limit': hdrs['x-ratelimit-limit'],
        'x-ratelimit-remaining': hdrs['x-ratelimit-remaining'],
        'x-request-id': hdrs['x-request-id'],
      };
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
      meta,
      usage: executeResult.usage,
      cost: executeResult.cost,
    };
  }

  /**
   * Handle streaming requests for a specific provider
   */
  async handleStreamRequest(
    req: Request,
    res: Response,
    providerName: string,
    validation: ProviderValidationResult
  ): Promise<void> {
    const { provider, apiKey, pathResult } = validation;

    // Extract model using the same extraction method as non-stream requests
    const model = this.extractModel(req, provider!, pathResult!.path);

    // Get provider config to check if it supports native USD cost
    const providerConfig = this.providerManager.get(providerName);

    // Validate model pricing before making upstream request
    const pricingValidation = this.validateModelPricing(
      providerName,
      model,
      providerConfig?.supportsNativeUsdCost || false
    );

    if (!pricingValidation.valid) {
      res.status(400).json({
        error: {
          message: pricingValidation.error,
          type: 'invalid_request_error',
          code: 'model_not_supported',
        },
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
      upstream_path: pathResult!.path,
      upstream_streamed: true,
    };

    // ⭐️ Set initial upstream meta early so BaseLLMProvider can update it during stream end
    (res as any).locals.upstream = meta;

    const started = Date.now();
    try {
      const upstreamPath = pathResult!.path;
      // 使用统一的流式判断方法，不再硬编码stream: true
      const data = { ...(req.body || {}) };

      // ⭐️ 关键修复：将提取的模型名称添加到请求数据中
      if (model) {
        data.model = model;
      }

      // ⭐️ BaseLLMProvider will:
      // 1. Set res.locals.usageInfo, costResult, usage before destination.end()
      // 2. Update res.locals.upstream with request_id, cost, bytes, status
      // 3. Trigger res.on('finish') which calls accessLog and PaymentKit middlewares
      const result = await provider!.executeStreamRequest(apiKey!, upstreamPath, 'POST', data, res);

      meta.upstream_duration_ms = Date.now() - started;

      if (!result.success) {
        meta.upstream_status_code = result.statusCode;
        meta.error_code = result.errorCode;
        meta.error_type = result.errorType;
        meta.upstream_request_id = result.upstreamRequestId;
        (res as any).locals.upstream = meta;

        // Send error event to client via SSE format
        if (!res.writableEnded) {
          try {
            const errorEvent = {
              type: 'error',
              error: {
                message: result.error || 'Stream request failed',
                type: result.errorType || 'gateway_error',
                code: result.errorCode || 'unknown_error',
              },
            };
            const errorData = `event: error\ndata: ${JSON.stringify(errorEvent)}\n\n`;

            // Write error data first, then call end()
            // PaymentKit wraps res.end() and injects payment frame BEFORE calling originalEnd(args)
            // So we need to write() first to ensure error data comes before payment frame
            res.write(errorData);
            res.end();
          } catch (writeError) {
            console.error('[RouteHandler] Failed to send error event:', writeError);
            if (!res.writableEnded) {
              res.end();
            }
          }
        } else {
          console.warn('[RouteHandler] Response already ended, cannot send error event');
        }
        return;
      }

      // ⭐️ Update meta with additional values (most are already set by BaseLLMProvider)
      meta.upstream_duration_ms = Date.now() - started;

      // Extract headers for monitoring (if rawResponse is available)
      if (result.rawResponse) {
        const hdrs = result.rawResponse.headers || {};
        meta.upstream_headers_subset = {
          'x-usage': hdrs['x-usage'],
          'x-ratelimit-limit': hdrs['x-ratelimit-limit'],
          'x-ratelimit-remaining': hdrs['x-ratelimit-remaining'],
          'x-request-id': hdrs['x-request-id'],
        };
      }

      // Final update to upstream meta (BaseLLMProvider already set most fields)
      (res as any).locals.upstream = { ...meta, ...(res as any).locals.upstream };
    } catch (e: any) {
      meta.upstream_duration_ms = Date.now() - started;
      meta.upstream_status_code = 500;
      (res as any).locals.upstream = meta;
      console.error('Error in stream proxy:', e);
      if (!res.headersSent) res.status(500).end();
    }
  }

  /**
   * Extract model from request using provider-specific extractor
   */
  private extractModel(req: Request, provider: LLMProvider, path: string): string | undefined {
    // Use provider-specific model extractor if available
    const modelExtractor = provider.createModelExtractor?.();

    if (modelExtractor) {
      const result = modelExtractor.extractModel(req, path);
      return result?.model;
    }

    // Fallback to default extraction logic
    return this.getRequestData(req)?.model;
  }

  /**
   * Extract stream flag from request using provider-specific extractor
   */
  private extractStream(req: Request, provider: LLMProvider, path: string): boolean {
    // Use provider-specific stream extractor if available
    const streamExtractor = (provider as any).createStreamExtractor?.();

    if (streamExtractor) {
      const result = streamExtractor.extractStream(req, path);
      return result.isStream;
    }

    // Fallback to default extraction logic (from body)
    const requestData = this.getRequestData(req);
    return !!(requestData && requestData.stream);
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
