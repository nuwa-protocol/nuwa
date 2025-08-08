import { Strategy, BillingContext } from '../core/types';

/**
 * Base class for all billing strategies
 */
export abstract class BaseStrategy implements Strategy {
  /**
   * Default implementation: most strategies don't require execution results
   */
  readonly deferred: boolean = false;
  /**
   * Convert string or bigint to bigint
   * Handles scientific notation strings like "5e12"
   */
  protected toBigInt(value: string | bigint | number): bigint {
    if (typeof value === 'bigint') {
      return value;
    }
    if (typeof value === 'number') {
      return BigInt(value);
    }
    // Handle scientific notation
    if (value.includes('e') || value.includes('E')) {
      const num = parseFloat(value);
      return BigInt(Math.round(num));
    }
    return BigInt(value);
  }

  /**
   * Abstract method to be implemented by concrete strategies
   */
  abstract evaluate(ctx: BillingContext, units: number): bigint;
} 