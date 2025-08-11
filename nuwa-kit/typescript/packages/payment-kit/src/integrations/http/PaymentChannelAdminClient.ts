import type {
  HealthResponse,
  ClaimsStatusResponse,
  ClaimTriggerRequest,
  ClaimTriggerResponse,
  SubRavRequest,
  SubRavResponse,
} from '../../schema';
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
   * Build URL for payment-related endpoints (internal use)
   */
  private buildPaymentUrl(endpoint: string): string {
    // Use the public buildPaymentUrl method
    return this.httpClient.buildPaymentUrl(endpoint);
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
    const result = await this.httpClient.get<ClaimsStatusResponse>(
      this.buildPaymentUrl('/admin/claims')
    );
    return result.data;
  }

  /**
   * Manually trigger a claim for a specific channel (admin only)
   */
  async triggerClaim(request: ClaimTriggerRequest): Promise<ClaimTriggerResponse> {
    const result = await this.httpClient.post<ClaimTriggerResponse>(
      this.buildPaymentUrl('/admin/claim-trigger'),
      request
    );
    return result.data;
  }

  /**
   * Query SubRAV details (requires auth, users can only query their own)
   */
  async querySubRav(request: SubRavRequest): Promise<SubRavResponse> {
    const queryPath = `/subrav?nonce=${encodeURIComponent(request.nonce)}`;
    const result = await this.httpClient.get<SubRavResponse>(this.buildPaymentUrl(queryPath));
    return result.data;
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
