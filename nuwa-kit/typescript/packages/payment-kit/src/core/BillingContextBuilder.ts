import type { BillingContext } from '../billing';
import type { RequestMetadata } from './PaymentProcessor';
import type { HttpRequestPayload } from './types';

/**
 * Request context for billing purposes
 */
export interface BillingRequestContext {
  /** HTTP path */
  path?: string;
  /** Asset ID for settlement */
  assetId?: string;
  /** Payment channel ID */
  channelId?: string;
  /** VM ID fragment */
  vmIdFragment?: string;
  /** Additional metadata */
  [key: string]: any;
}

/**
 * Builder for creating billing contexts from various request sources
 */
export class BillingContextBuilder {
  /**
   * Build billing context from protocol-agnostic request metadata
   */
  static build(
    serviceId: string,
    requestMeta: RequestMetadata,
  ): BillingContext {
    return {
      serviceId,
      operation: requestMeta.operation,
      meta: requestMeta
    };
  }

  /**
   * Build billing context from HTTP request
   */
  static fromHttpRequest(
    serviceId: string,
    req: HttpRequest,
    paymentData?: HttpRequestPayload
  ): BillingContext {
    // Extract channel ID and payer key ID from the signed SubRAV
    const channelId = paymentData?.signedSubRav.subRav.channelId;
    const vmIdFragment = paymentData?.signedSubRav.subRav.vmIdFragment;
    
    const meta: BillingRequestContext = {
      path: req.path,
      method: req.method,
      // Extract additional metadata from query/body
      ...req.query,
      ...(req.body && typeof req.body === 'object' ? req.body : {}),
      // Include channel ID and vm ID fragment from SubRAV
      channelId,
      vmIdFragment
    };

    return {
      serviceId,
      operation: `${req.method.toLowerCase()}:${req.path}`,
      meta
    };
  }

  /**
   * Enhance existing billing context with additional metadata
   */
  static enhance(
    context: BillingContext,
    additionalMeta: Record<string, any>
  ): BillingContext {
    return {
      ...context,
      meta: {
        ...context.meta,
        ...additionalMeta
      }
    };
  }

  /**
   * Validate billing context
   */
  static validate(context: BillingContext): { isValid: boolean; error?: string } {
    if (!context.serviceId) {
      return { isValid: false, error: 'serviceId is required' };
    }

    if (!context.operation) {
      return { isValid: false, error: 'operation is required' };
    }

    return { isValid: true };
  }

  /**
   * Extract operation type from operation string
   */
  static extractOperationType(operation: string): string {
    const parts = operation.split(':');
    return parts[0] || 'unknown';
  }

  /**
   * Extract operation path from operation string
   */
  static extractOperationPath(operation: string): string {
    const parts = operation.split(':');
    return parts.slice(1).join(':') || '';
  }
}

// Type definitions for different protocols
interface HttpRequest {
  path: string;
  method: string;
  headers: Record<string, string | string[]>;
  query: Record<string, any>;
  body?: any;
}