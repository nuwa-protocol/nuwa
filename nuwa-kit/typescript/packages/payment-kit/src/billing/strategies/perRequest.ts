import { BaseStrategy } from './base';
import { BillingContext } from '../core/types';

/**
 * Configuration for PerRequest strategy
 */
export interface PerRequestConfig {
  /** Fixed price per request */
  price: string | bigint | number;
}

/**
 * Per-request fixed pricing strategy
 * Charges a fixed amount for each request regardless of content
 */
export class PerRequestStrategy extends BaseStrategy {
  private readonly price: bigint;

  constructor(config: PerRequestConfig) {
    super();
    this.price = this.toBigInt(config.price);
  }

  override evaluate(ctx: BillingContext, units: number): bigint {
    const u = Number.isFinite(units) && units > 0 ? Math.floor(units) : 1;
    return this.price * BigInt(u);
  }
} 