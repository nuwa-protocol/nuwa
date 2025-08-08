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
   * Extract error code from error message
   */
  static extractErrorCode(error: string): string {
    if (error.includes('not found in pending list')) {
      return 'UNKNOWN_SUBRAV';
    } else if (error.includes('does not match')) {
      return 'TAMPERED_SUBRAV';
    } else if (error.includes('Invalid') && error.includes('signature')) {
      return 'INVALID_PAYMENT';
    } else if (error.includes('Channel')) {
      return 'CHANNEL_CLOSED';
    } else if (error.includes('Epoch')) {
      return 'EPOCH_MISMATCH';
    } else if (error.includes('insufficient')) {
      return 'INSUFFICIENT_FUNDS';
    }
    return 'PAYMENT_ERROR';
  }

  /**
   * Validate SubRAV structure
   */
  static validateSubRAV(subRAV: SubRAV): { isValid: boolean; error?: string } {
    if (!subRAV.channelId) {
      return { isValid: false, error: 'channelId is required' };
    }

    if (!subRAV.vmIdFragment) {
      return { isValid: false, error: 'vmIdFragment is required' };
    }

    if (subRAV.nonce < 0n) {
      return { isValid: false, error: 'nonce must be non-negative' };
    }

    if (subRAV.accumulatedAmount < 0n) {
      return { isValid: false, error: 'accumulatedAmount must be non-negative' };
    }

    return { isValid: true };
  }

  /**
   * Calculate SubRAV hash for comparison
   */
  static calculateSubRAVHash(subRAV: SubRAV): string {
    const data = `${subRAV.version}-${subRAV.chainId}-${subRAV.channelId}-${subRAV.channelEpoch}-${subRAV.vmIdFragment}-${subRAV.accumulatedAmount}-${subRAV.nonce}`;
    
    // Simple hash implementation - in production, use a proper cryptographic hash
    let hash = 0;
    for (let i = 0; i < data.length; i++) {
      const char = data.charCodeAt(i);
      hash = ((hash << 5) - hash) + char;
      hash = hash & hash; // Convert to 32-bit integer
    }
    return hash.toString(16);
  }

  /**
   * Format amount for display
   */
  static formatAmount(amount: bigint, decimals: number = 6): string {
    const divisor = BigInt(10 ** decimals);
    const whole = amount / divisor;
    const remainder = amount % divisor;
    
    if (remainder === 0n) {
      return whole.toString();
    }
    
    const remainderStr = remainder.toString().padStart(decimals, '0');
    return `${whole}.${remainderStr.replace(/0+$/, '')}`;
  }

  /**
   * Parse amount from string
   */
  static parseAmount(amountStr: string, decimals: number = 6): bigint {
    const parts = amountStr.split('.');
    const whole = BigInt(parts[0] || '0');
    
    if (parts.length === 1) {
      return whole * BigInt(10 ** decimals);
    }
    
    const fractional = parts[1].padEnd(decimals, '0').substring(0, decimals);
    const fractionalBigInt = BigInt(fractional);
    
    return whole * BigInt(10 ** decimals) + fractionalBigInt;
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
   * Check if channel ID is valid format
   */
  static isValidChannelId(channelId: string): boolean {
    // Basic validation - adjust based on your channel ID format
    return /^[a-zA-Z0-9_-]+$/.test(channelId) && channelId.length > 0;
  }

  /**
   * Check if vm ID fragment is valid format
   */
  static isValidVmIdFragment(vmIdFragment: string): boolean {
    // Basic validation - adjust based on your vm ID fragment format
    return /^[a-zA-Z0-9_-]+$/.test(vmIdFragment) && vmIdFragment.length > 0;
  }

  /**
   * Safe BigInt comparison
   */
  static compareBigInt(a: bigint, b: bigint): number {
    if (a < b) return -1;
    if (a > b) return 1;
    return 0;
  }

  /**
   * Convert error to user-friendly message
   */
  static friendlyErrorMessage(errorCode: string): string {
    switch (errorCode) {
      case 'PAYMENT_REQUIRED':
        return 'Payment is required to access this service';
      case 'INVALID_PAYMENT':
        return 'The provided payment information is invalid';
      case 'UNKNOWN_SUBRAV':
        return 'Payment not recognized. Please try again';
      case 'TAMPERED_SUBRAV':
        return 'Payment information has been modified. Please regenerate';
      case 'INSUFFICIENT_FUNDS':
        return 'Insufficient funds in payment channel';
      case 'CHANNEL_CLOSED':
        return 'Payment channel is closed or invalid';
      case 'EPOCH_MISMATCH':
        return 'Payment channel epoch mismatch. Please refresh';
      default:
        return 'Payment processing error. Please try again';
    }
  }
} 