/**
 * Unit tests for global pricing multiplier functionality
 * Tests environment-based pricing multiplier application
 */

import { UsagePolicy } from '../../src/billing/usagePolicy.js';
import { CostCalculator } from '../../src/billing/usage/CostCalculator.js';

describe('Global Pricing Multiplier Unit Tests', () => {
  const originalEnv = process.env.PRICING_MULTIPLIER;

  beforeAll(() => {
    process.env.PRICING_MULTIPLIER = '1.10'; // +10%
  });

  afterAll(() => {
    if (originalEnv === undefined) delete process.env.PRICING_MULTIPLIER;
    else process.env.PRICING_MULTIPLIER = originalEnv;
  });

  describe('Provider Cost Multiplier', () => {
    it('should apply multiplier to provider-reported cost (non-stream)', () => {
      const result = UsagePolicy.calculateRequestCost('gpt-4', 1.23);
      expect(result).not.toBeNull();
      // 1.23 * 1.10 = 1.353
      expect(result!.costUsd).toBeCloseTo(1.353, 10);
      expect(result!.source).toBe('provider');
    });
  });

  describe('Gateway Cost Multiplier', () => {
    it('should apply multiplier to gateway-calculated token cost (non-stream)', () => {
      const usage = { promptTokens: 1000, completionTokens: 500, totalTokens: 1500 };
      const result = UsagePolicy.calculateRequestCost('gpt-4', undefined, usage);
      expect(result).not.toBeNull();
      // Pricing: 1000/1e6*30 + 500/1e6*60 = 0.06; *1.10 = 0.066
      expect(result!.costUsd).toBeCloseTo(0.066, 10);
      expect(result!.source).toBe('gateway-pricing');
    });
  });

  describe('Stream Processor Multiplier', () => {
    it('should apply multiplier to final provider cost in stream processor', () => {
      // Create stream processor with provider cost 0.1
      const sp = UsagePolicy.createStreamProcessor('gpt-4', 0.1);

      // Simulate a Chat Completions SSE usage chunk
      const chunk = 'data: {"usage":{"prompt_tokens":10,"completion_tokens":20,"total_tokens":30}}\n';
      sp.processChunk(chunk);

      const finalCost = sp.getFinalCost();
      expect(finalCost).not.toBeNull();
      // Provider path preferred in calculateRequestCost: 0.1 * 1.10 = 0.11
      expect(finalCost!.costUsd).toBeCloseTo(0.11, 10);
    });
  });

  describe('Multiplier Bounds', () => {
    it('should clamp multiplier to 2 (upper bound)', () => {
      const original = process.env.PRICING_MULTIPLIER;
      process.env.PRICING_MULTIPLIER = '10'; // will clamp to 2
      // reset cache
      (CostCalculator as any).cachedMultiplier = null;
      const result = UsagePolicy.calculateRequestCost('gpt-4', 1.0);
      expect(result).not.toBeNull();
      expect(result!.costUsd).toBeCloseTo(2.0, 10);
      if (original === undefined) delete process.env.PRICING_MULTIPLIER; else process.env.PRICING_MULTIPLIER = original;
      (CostCalculator as any).cachedMultiplier = null;
    });
  });
});
