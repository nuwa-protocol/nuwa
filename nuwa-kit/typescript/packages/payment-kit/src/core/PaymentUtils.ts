import type { SubRAV } from './types';

/**
 * Payment utility functions that are used across different payment processors
 */
export class PaymentUtils {
  /**
   * Generate transaction reference
   */
  static generateTxRef(): string {
    return `tx_${Date.now()}_${Math.random().toString(36).substring(2, 11)}`;
  }

  /**
   * Check if two SubRAVs match (ignoring signature)
   */
  static subRAVsMatch(subRAV1: SubRAV, subRAV2: SubRAV): boolean {
    return (
      subRAV1.version === subRAV2.version &&
      subRAV1.chainId === subRAV2.chainId &&
      subRAV1.channelId === subRAV2.channelId &&
      subRAV1.channelEpoch === subRAV2.channelEpoch &&
      subRAV1.vmIdFragment === subRAV2.vmIdFragment &&
      subRAV1.accumulatedAmount === subRAV2.accumulatedAmount &&
      subRAV1.nonce === subRAV2.nonce
    );
  }
  
  /**
   * Generate unique ID for tracking
   */
  static generateId(prefix: string = ''): string {
    const timestamp = Date.now().toString(36);
    const random = Math.random().toString(36).substring(2, 9);
    return prefix ? `${prefix}_${timestamp}_${random}` : `${timestamp}_${random}`;
  }

  /**
   * Safe BigInt comparison
   */
  static compareBigInt(a: bigint, b: bigint): number {
    if (a < b) return -1;
    if (a > b) return 1;
    return 0;
  }

} 