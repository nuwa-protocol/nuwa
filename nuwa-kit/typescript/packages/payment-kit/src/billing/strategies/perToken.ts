import type { BillingContext } from '../core/types';
import { BaseStrategy } from './base';

/**
 * PerToken strategy configuration
 */
export interface PerTokenConfig {
  /** Price per token in picoUSD */
  unitPricePicoUSD: string | bigint;
}

/**
 * Per-token billing strategy
 *
 * Calculates cost based on token usage: unitPricePicoUSD × tokens
 */
export class PerTokenStrategy extends BaseStrategy {
  /**
   * PerToken strategy requires execution results (usage data) from LLM calls
   */
  readonly deferred: boolean = true;

  private readonly unitPrice: bigint;

  constructor(config: PerTokenConfig) {
    super();
    this.unitPrice = this.toBigInt(config.unitPricePicoUSD);
  }

  override evaluate(ctx: BillingContext, units: number): bigint {
    const tokenCount = Number.isFinite(units) && units > 0 ? Math.floor(units) : 1;
    return this.unitPrice * BigInt(tokenCount);
  }
}
