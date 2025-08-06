import type { 
  HealthResponse,
  ClaimsStatusResponse,
  ClaimTriggerRequest,
  ClaimTriggerResponse,
  SubRavRequest,
  CleanupRequest,
  CleanupResponse
} from '../../types/api';
import { PaymentChannelHttpClient } from './PaymentChannelHttpClient';

/**
 * PaymentChannelAdminClient provides a simplified interface for calling
 * Payment Kit admin endpoints.
 * 
 * This is a lightweight wrapper around PaymentChannelHttpClient that
 * provides type-safe admin API calls without the complexity of payment 
 * channel management.
 * 
 * Features:
 * - Type-safe admin API calls
 * - Reuses existing PaymentChannelHttpClient functionality
 * - No additional setup required
 */
export class PaymentChannelAdminClient {
  private httpClient: PaymentChannelHttpClient;

  constructor(httpClient: PaymentChannelHttpClient) {
    this.httpClient = httpClient;
  }

  /**
   * Health check endpoint (public, no auth required)
   */
  async healthCheck(): Promise<HealthResponse> {
    return this.httpClient.healthCheck();
  }

  /**
   * Get claims status and processing statistics (admin only)
   */
  async getClaimsStatus(): Promise<ClaimsStatusResponse> {
    return this.httpClient.get<ClaimsStatusResponse>('/admin/claims');
  }

  /**
   * Manually trigger a claim for a specific channel (admin only)
   */
  async triggerClaim(request: ClaimTriggerRequest): Promise<ClaimTriggerResponse> {
    return this.httpClient.post<ClaimTriggerResponse>('/admin/claim-trigger', request);
  }

  /**
   * Query SubRAV details (requires auth, users can only query their own)
   */
  async querySubRav(request: SubRavRequest): Promise<any> {
    const queryPath = `/subrav?channelId=${encodeURIComponent(request.channelId)}&nonce=${encodeURIComponent(request.nonce)}`;
    return this.httpClient.get<any>(queryPath);
  }

  /**
   * Clean up old SubRAV proposals (admin only)
   */
  async cleanup(request?: CleanupRequest): Promise<CleanupResponse> {
    if (request) {
      // Use the generic request method for DELETE with body
      const response = await this.httpClient.request('DELETE', '/admin/cleanup', {
        body: JSON.stringify(request),
        headers: { 'Content-Type': 'application/json' }
      });
      return (this.httpClient as any).parseJsonResponse(response);
    } else {
      return this.httpClient.delete<CleanupResponse>('/admin/cleanup');
    }
  }

  /**
   * Discover service information
   */
  async discoverService(): Promise<any> {
    return this.httpClient.discoverService();
  }

}

/**
 * Create an admin client from an existing PaymentChannelHttpClient
 */
export function createAdminClient(httpClient: PaymentChannelHttpClient): PaymentChannelAdminClient {
  return new PaymentChannelAdminClient(httpClient);
}