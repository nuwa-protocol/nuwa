/**
 * Service detector utility for checking service capabilities
 * Based on PaymentChannelHttpClient discovery capabilities
 */

export interface ServiceDiscoveryInfo {
  serviceId: string;
  serviceDid: string;
  defaultAssetId: string;
  network?: string;
  basePath?: string;
  defaultPricePicoUSD?: string;
  supportedFeatures?: string[];
  protocolVersion?: string;
}

export interface ServiceDetectionResult {
  isOnline: boolean;
  isPaymentEnabled: boolean;
  discoveryInfo?: ServiceDiscoveryInfo;
  error?: string;
  responseTime?: number;
}

/**
 * Simple service detector for HTTP-based services
 * This is a simplified version that can be enhanced later
 */
export class ServiceDetector {
  private cache = new Map<string, { result: ServiceDetectionResult; timestamp: number }>();
  private readonly cacheTimeout = 5 * 60 * 1000; // 5 minutes

  /**
   * Detect service capabilities by checking well-known endpoints
   */
  async detectService(serviceEndpoint: string): Promise<ServiceDetectionResult> {
    const cacheKey = serviceEndpoint;

    // Check cache
    const cached = this.cache.get(cacheKey);
    if (cached && Date.now() - cached.timestamp < this.cacheTimeout) {
      return cached.result;
    }

    const startTime = Date.now();

    try {
      // Check well-known payment info endpoint
      const paymentInfo = await this.checkWellKnownPaymentEndpoint(serviceEndpoint);
      const responseTime = Date.now() - startTime;

      const result: ServiceDetectionResult = {
        isOnline: true,
        isPaymentEnabled: !!paymentInfo,
        discoveryInfo: paymentInfo || undefined,
        responseTime,
      };

      // Cache result
      this.cache.set(cacheKey, { result, timestamp: Date.now() });

      return result;
    } catch (error) {
      const responseTime = Date.now() - startTime;
      const result: ServiceDetectionResult = {
        isOnline: false,
        isPaymentEnabled: false,
        error: error instanceof Error ? error.message : 'Unknown error',
        responseTime,
      };

      // Cache error result for shorter time
      this.cache.set(cacheKey, { result, timestamp: Date.now() - this.cacheTimeout + 30000 }); // 30s cache for errors

      return result;
    }
  }

  /**
   * Check the well-known payment info endpoint
   */
  private async checkWellKnownPaymentEndpoint(
    baseUrl: string
  ): Promise<ServiceDiscoveryInfo | null> {
    try {
      // Normalize URL
      const normalizedUrl = baseUrl.endsWith('/') ? baseUrl.slice(0, -1) : baseUrl;
      const wellKnownUrl = `${normalizedUrl}/.well-known/nuwa-payment/info`;

      // Fetch with timeout
      const controller = new AbortController();
      const timeout = setTimeout(() => controller.abort(), 5000);

      try {
        const response = await fetch(wellKnownUrl, {
          method: 'GET',
          headers: {
            Accept: 'application/json',
            'User-Agent': 'cadop-web-service-detector/1.0.0',
          },
          signal: controller.signal,
        });

        clearTimeout(timeout);

        if (!response.ok) {
          throw new Error(`HTTP ${response.status}: ${response.statusText}`);
        }

        const contentType = response.headers.get('content-type');
        if (!contentType || !contentType.includes('application/json')) {
          throw new Error('Response is not JSON');
        }

        const data = await response.json();

        // Validate required fields
        if (!data.serviceId || !data.serviceDid || !data.defaultAssetId) {
          throw new Error('Invalid discovery info: missing required fields');
        }

        return {
          serviceId: data.serviceId,
          serviceDid: data.serviceDid,
          defaultAssetId: data.defaultAssetId,
          network: data.network,
          basePath: data.basePath,
          defaultPricePicoUSD: data.defaultPricePicoUSD,
          supportedFeatures: data.supportedFeatures,
          protocolVersion: data.protocolVersion || data.version?.toString(),
        };
      } catch (fetchError) {
        clearTimeout(timeout);
        if (fetchError instanceof Error && fetchError.name === 'AbortError') {
          throw new Error('Request timeout');
        }
        throw fetchError;
      }
    } catch (error) {
      // Return null for any error - service might be online but not payment-enabled
      return null;
    }
  }

  /**
   * Batch detect multiple services
   */
  async detectServices(serviceEndpoints: string[]): Promise<Map<string, ServiceDetectionResult>> {
    const results = new Map<string, ServiceDetectionResult>();

    // Process in parallel with concurrency limit
    const concurrency = 3;
    const chunks = [];
    for (let i = 0; i < serviceEndpoints.length; i += concurrency) {
      chunks.push(serviceEndpoints.slice(i, i + concurrency));
    }

    for (const chunk of chunks) {
      const promises = chunk.map(async endpoint => {
        const result = await this.detectService(endpoint);
        return { endpoint, result };
      });

      const chunkResults = await Promise.all(promises);
      chunkResults.forEach(({ endpoint, result }) => {
        results.set(endpoint, result);
      });
    }

    return results;
  }

  /**
   * Clear detection cache
   */
  clearCache(): void {
    this.cache.clear();
  }

  /**
   * Get cache statistics
   */
  getCacheStats(): { size: number; entries: Array<{ url: string; age: number }> } {
    const now = Date.now();
    const entries = Array.from(this.cache.entries()).map(([url, cached]) => ({
      url,
      age: now - cached.timestamp,
    }));

    return {
      size: this.cache.size,
      entries,
    };
  }
}

// Global instance
let globalDetector: ServiceDetector | null = null;

/**
 * Get global service detector instance
 */
export function getServiceDetector(): ServiceDetector {
  if (!globalDetector) {
    globalDetector = new ServiceDetector();
  }
  return globalDetector;
}

/**
 * Utility function to format response time
 */
export function formatResponseTime(ms: number): string {
  if (ms < 1000) {
    return `${Math.round(ms)}ms`;
  } else {
    return `${(ms / 1000).toFixed(1)}s`;
  }
}

/**
 * Utility function to determine service health based on response time
 */
export function getServiceHealth(responseTime: number): 'excellent' | 'good' | 'fair' | 'poor' {
  if (responseTime < 200) return 'excellent';
  if (responseTime < 500) return 'good';
  if (responseTime < 1000) return 'fair';
  return 'poor';
}

/**
 * Utility function to get health color
 */
export function getHealthColor(health: ReturnType<typeof getServiceHealth>): string {
  switch (health) {
    case 'excellent':
      return 'text-green-600';
    case 'good':
      return 'text-blue-600';
    case 'fair':
      return 'text-yellow-600';
    case 'poor':
      return 'text-red-600';
    default:
      return 'text-gray-600';
  }
}
