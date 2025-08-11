import type { BillingContext } from './types';

/**
 * Utility functions for billing context operations
 */
export class BillingUtils {
  /**
   * Validate billing context
   */
  static validate(context: BillingContext): { isValid: boolean; error?: string } {
    if (!context.serviceId) {
      return { isValid: false, error: 'serviceId is required' };
    }

    if (!context.meta.operation) {
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

  /**
   * Create a basic billing context
   */
  static createContext(
    serviceId: string,
    operation: string,
    assetId?: string,
    additionalMeta?: Record<string, any>
  ): BillingContext {
    return {
      serviceId,
      assetId,
      meta: {
        operation,
        ...additionalMeta,
      },
    };
  }

  /**
   * Enhance existing billing context with additional metadata
   */
  static enhance(context: BillingContext, additionalMeta: Record<string, any>): BillingContext {
    return {
      ...context,
      meta: {
        ...context.meta,
        ...additionalMeta,
      },
    };
  }

  /**
   * Extract payment channel information from BillingContext
   */
  static extractPaymentChannelInfo(context: BillingContext): {
    channelId?: string;
    vmIdFragment?: string;
  } {
    const signedSubRav = context.meta.signedSubRav;
    if (!signedSubRav) {
      return {};
    }

    return {
      channelId: signedSubRav.subRav.channelId,
      vmIdFragment: signedSubRav.subRav.vmIdFragment,
    };
  }
}
