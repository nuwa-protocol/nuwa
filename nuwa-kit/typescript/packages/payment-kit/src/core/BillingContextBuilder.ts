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