import { DebugLogger } from '@nuwa-ai/identity-kit';
import { Client as McpClient } from '@modelcontextprotocol/sdk/client/index.js';
import { StreamableHTTPClientTransport } from '@modelcontextprotocol/sdk/client/streamableHttp.js';
import type {
  NuwaPaymentInfo,
  EnhancedServerCapabilities,
  ServerDetectionResult,
  DetectionOptions,
} from './types';
import { McpServerType } from './types';

/**
 * Server detector for identifying MCP server capabilities
 * and payment protocol support
 */
export class ServerDetector {
  private logger: DebugLogger;
  private cache = new Map<string, ServerDetectionResult>();

  constructor(private options: DetectionOptions = {}) {
    this.logger = DebugLogger.get('ServerDetector');
  }

  /**
   * Detect server capabilities and type
   * @param baseUrl - MCP server base URL
   * @returns Detection result with server type and capabilities
   */
  async detectCapabilities(baseUrl: string): Promise<ServerDetectionResult> {
    const cacheKey = baseUrl;

    // Check cache if enabled
    if (this.options.cache !== false && this.cache.has(cacheKey)) {
      const cached = this.cache.get(cacheKey)!;
      // Cache for 5 minutes
      if (Date.now() - cached.detectedAt < 5 * 60 * 1000) {
        this.logger.debug('Using cached detection result', { baseUrl });
        return cached;
      }
    }

    this.logger.debug('Detecting server capabilities', { baseUrl });

    try {
      // 1. Check for Nuwa payment protocol support
      const paymentInfo = await this.checkWellKnownEndpoint(baseUrl);

      // 2. Get standard MCP capabilities
      const mcpCapabilities = await this.getMcpCapabilities(baseUrl);

      // 3. Combine information to determine server type and capabilities
      const result = this.combineCapabilities(paymentInfo, mcpCapabilities);

      // Cache result if enabled
      if (this.options.cache !== false) {
        this.cache.set(cacheKey, result);
      }

      this.logger.debug('Detection completed', {
        baseUrl,
        type: result.type,
        hasPaymentInfo: !!result.paymentInfo,
      });

      return result;
    } catch (error) {
      this.logger.warn('Detection failed, falling back to standard MCP', {
        baseUrl,
        error: error instanceof Error ? error.message : String(error),
      });

      // Fallback to standard MCP
      const fallbackResult: ServerDetectionResult = {
        type: McpServerType.STANDARD,
        capabilities: {},
        detectedAt: Date.now(),
      };

      if (this.options.cache !== false) {
        this.cache.set(cacheKey, fallbackResult);
      }

      return fallbackResult;
    }
  }

  /**
   * Check for Nuwa payment protocol support via well-known endpoint
   * @param baseUrl - MCP server base URL
   * @returns Payment info if supported, null otherwise
   */
  private async checkWellKnownEndpoint(baseUrl: string): Promise<NuwaPaymentInfo | null> {
    try {
      const url = new URL('/.well-known/nuwa-payment/info', baseUrl);
      const fetchImpl = this.options.fetchImpl || (globalThis as any).fetch?.bind(globalThis);

      if (!fetchImpl) {
        this.logger.debug('No fetch implementation available');
        return null;
      }

      const controller = new AbortController();
      const timeout = this.options.timeout || 5000;
      const timeoutId = setTimeout(() => controller.abort(), timeout);

      try {
        const response = await fetchImpl(url.toString(), {
          method: 'GET',
          headers: {
            Accept: 'application/json',
            'User-Agent': 'nuwa-payment-kit/1.0.0',
          },
          signal: controller.signal,
        });

        clearTimeout(timeoutId);

        if (response.ok) {
          const contentType = response.headers.get('content-type');
          if (contentType && contentType.includes('application/json')) {
            const paymentInfo = (await response.json()) as NuwaPaymentInfo;

            // Validate required fields
            if (paymentInfo.serviceId && paymentInfo.serviceDid && paymentInfo.defaultAssetId) {
              this.logger.debug('Found Nuwa payment info', {
                serviceId: paymentInfo.serviceId,
                serviceDid: paymentInfo.serviceDid,
                defaultAssetId: paymentInfo.defaultAssetId,
              });
              return paymentInfo;
            } else {
              this.logger.warn('Invalid payment info format', { paymentInfo });
            }
          }
        } else {
          this.logger.debug('Well-known endpoint returned non-OK status', {
            status: response.status,
            statusText: response.statusText,
          });
        }
      } catch (error) {
        clearTimeout(timeoutId);
        if (error instanceof Error && error.name === 'AbortError') {
          this.logger.debug('Well-known endpoint request timed out');
        } else {
          this.logger.debug('Well-known endpoint request failed', {
            error: error instanceof Error ? error.message : String(error),
          });
        }
      }
    } catch (error) {
      this.logger.debug('Failed to check well-known endpoint', {
        error: error instanceof Error ? error.message : String(error),
      });
    }

    return null;
  }

  /**
   * Get standard MCP server capabilities
   * @param baseUrl - MCP server base URL
   * @returns MCP capabilities or empty object if failed
   */
  private async getMcpCapabilities(baseUrl: string): Promise<EnhancedServerCapabilities> {
    let mcpClient: McpClient | undefined;

    try {
      const transport = new StreamableHTTPClientTransport(new URL(baseUrl));
      mcpClient = new McpClient({
        name: 'nuwa-detector-client',
        version: '1.0.0',
      });

      // Set timeout for connection
      const controller = new AbortController();
      const timeout = this.options.timeout || 5000;
      const timeoutId = setTimeout(() => controller.abort(), timeout);

      try {
        await mcpClient.connect(transport);
        clearTimeout(timeoutId);

        // Get server capabilities from the initialized connection
        const capabilities = (mcpClient as any).serverCapabilities || {};

        this.logger.debug('Retrieved MCP capabilities', { capabilities });
        return capabilities;
      } catch (error) {
        clearTimeout(timeoutId);
        throw error;
      }
    } catch (error) {
      this.logger.debug('Failed to get MCP capabilities', {
        error: error instanceof Error ? error.message : String(error),
      });
      return {};
    } finally {
      if (mcpClient) {
        try {
          await mcpClient.close();
        } catch (error) {
          // Ignore close errors
        }
      }
    }
  }

  /**
   * Combine payment info and MCP capabilities to determine server type
   * @param paymentInfo - Nuwa payment info if available
   * @param mcpCapabilities - Standard MCP capabilities
   * @returns Combined detection result
   */
  private combineCapabilities(
    paymentInfo: NuwaPaymentInfo | null,
    mcpCapabilities: EnhancedServerCapabilities
  ): ServerDetectionResult {
    const hasPaymentSupport = !!paymentInfo;
    const serverType = hasPaymentSupport ? McpServerType.PAYMENT_ENABLED : McpServerType.STANDARD;

    const enhancedCapabilities: EnhancedServerCapabilities = {
      ...mcpCapabilities,
      nuwa: {
        payment: hasPaymentSupport
          ? {
              supported: true,
              serviceId: paymentInfo!.serviceId,
              serviceDid: paymentInfo!.serviceDid,
              defaultAssetId: paymentInfo!.defaultAssetId,
              basePath: paymentInfo!.basePath,
              protocolVersion: paymentInfo!.protocolVersion,
            }
          : {
              supported: false,
            },
        auth: {
          supported: hasPaymentSupport, // Auth is typically required for payment
          methods: hasPaymentSupport ? ['did-auth'] : [],
        },
        builtinTools: {
          supported: hasPaymentSupport, // Built-in tools are part of payment protocol
          tools: hasPaymentSupport
            ? [
                'nuwa.health',
                'nuwa.discovery',
                'nuwa.recovery',
                'nuwa.admin.status',
                'nuwa.subrav.query',
              ]
            : [],
        },
      },
    };

    return {
      type: serverType,
      capabilities: enhancedCapabilities,
      paymentInfo: paymentInfo || undefined,
      detectedAt: Date.now(),
    };
  }

  /**
   * Clear detection cache
   */
  clearCache(): void {
    this.cache.clear();
    this.logger.debug('Detection cache cleared');
  }

  /**
   * Get cache size for debugging
   */
  getCacheSize(): number {
    return this.cache.size;
  }
}
