/**
 * Unit tests for global pricing multiplier functionality
 * Tests environment-based pricing multiplier application
 */

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
      const result = CostCalculator.calculateRequestCost('gpt-4', 1.23);
      expect(result).not.toBeNull();
      // 1.23 * 1.10 = 1.353
      expect(result!.costUsd).toBeCloseTo(1.353, 10);
      expect(result!.source).toBe('provider');
    });
  });

  describe('Gateway Cost Multiplier', () => {
    it('should apply multiplier to gateway-calculated token cost (non-stream)', () => {
      const usage = { promptTokens: 1000, completionTokens: 500, totalTokens: 1500 };
      const result = CostCalculator.calculateRequestCost('gpt-4', undefined, usage);
      expect(result).not.toBeNull();
      // Pricing: 1000/1e6*30 + 500/1e6*60 = 0.06; *1.10 = 0.066
      expect(result!.costUsd).toBeCloseTo(0.066, 10);
      expect(result!.source).toBe('gateway-pricing');
    });
  });

  describe('Multiplier Bounds', () => {
    it('should clamp multiplier to 2 (upper bound)', () => {
      const original = process.env.PRICING_MULTIPLIER;
      process.env.PRICING_MULTIPLIER = '10'; // will clamp to 2
      // reset cache
      (CostCalculator as any).cachedMultiplier = null;
      const result = CostCalculator.calculateRequestCost('gpt-4', 1.0);
      expect(result).not.toBeNull();
      expect(result!.costUsd).toBeCloseTo(2.0, 10);
      if (original === undefined) delete process.env.PRICING_MULTIPLIER; else process.env.PRICING_MULTIPLIER = original;
      (CostCalculator as any).cachedMultiplier = null;
    });
  });
});
