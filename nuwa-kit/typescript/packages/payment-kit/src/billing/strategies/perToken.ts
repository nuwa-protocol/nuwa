import type { BillingContext } from '../core/types';
import { BaseStrategy } from './base';

/**
 * PerToken strategy configuration
 */
export interface PerTokenConfig {
  /** Price per token in picoUSD */
  unitPricePicoUSD: string | bigint;
  /** Key path to extract usage from context.meta (e.g., 'usage.total_tokens') */
  usageKey: string;
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
  private readonly usageKey: string;

  constructor(config: PerTokenConfig) {
    super();
    this.unitPrice = this.toBigInt(config.unitPricePicoUSD);
    this.usageKey = config.usageKey;
  }

  async evaluate(ctx: BillingContext): Promise<bigint> {
    
    // Extract usage from context metadata using the key path
    const tokens = this.extractUsage(ctx.meta, this.usageKey);
    
    if (tokens === null || tokens === undefined) {
      throw new Error(`Usage key '${this.usageKey}' not found in billing context metadata`);
    }

    // Convert to number if it's a string
    const tokenCount = typeof tokens === 'string' ? parseInt(tokens, 10) : Number(tokens);
    
    if (isNaN(tokenCount) || tokenCount < 0) {
      throw new Error(`Invalid token count: ${tokens}`);
    }

    // Calculate cost: unitPrice × tokenCount
    return this.unitPrice * BigInt(tokenCount);
  }

  /**
   * Extract usage value from metadata using dot notation key path
   */
  private extractUsage(meta: Record<string, any>, keyPath: string): any {
    const keys = keyPath.split('.');
    let current = meta;
    
    for (const key of keys) {
      if (current === null || current === undefined || typeof current !== 'object') {
        return null;
      }
      current = current[key];
    }
    
    return current;
  }
} 