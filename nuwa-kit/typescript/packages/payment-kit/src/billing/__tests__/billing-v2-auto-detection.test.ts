/**
 * Tests for Billing V2 automatic pre/post-flight detection
 */

import { BillingEngine } from '../engine/billingEngine';
import { BillingRule, RuleProvider } from '../core/types';
import { PerRequestStrategy, PerTokenStrategy } from '../strategies';
import { register as registerStrategy } from '../core/strategy-registry';

// Mock rule provider for testing
class MockRuleProvider implements RuleProvider {
  constructor(private rules: BillingRule[]) {}
  
  getRules(): BillingRule[] {
    return this.rules;
  }
}

describe('Billing V2 Auto-Detection', () => {
  beforeAll(() => {
    // Register strategies for testing
    registerStrategy('PerRequest', (cfg) => new PerRequestStrategy(cfg as any));
    registerStrategy('PerToken', (cfg) => new PerTokenStrategy(cfg as any));
  });

  describe('BillingEngine.isDeferred()', () => {
    it('should return false for PerRequest strategy (pre-flight)', () => {
      const rule: BillingRule = {
        id: 'test-per-request',
        strategy: {
          type: 'PerRequest',
          price: '1000000000000' // 1 picoUSD
        }
      };

      const ruleProvider = new MockRuleProvider([rule]);
      const engine = new BillingEngine(ruleProvider);

      expect(engine.isDeferred(rule)).toBe(false);
    });

    it('should return true for PerToken strategy (post-flight)', () => {
      const rule: BillingRule = {
        id: 'test-per-token',
        strategy: {
          type: 'PerToken',
          unitPricePicoUSD: '100000000', // 0.1 picoUSD per token
          usageKey: 'usage.total_tokens'
        }
      };

      const ruleProvider = new MockRuleProvider([rule]);
      const engine = new BillingEngine(ruleProvider);

      expect(engine.isDeferred(rule)).toBe(true);
    });
  });

  describe('BillingEngine.isDeferredByContext()', () => {
    it('should return false when no rule matches', () => {
      const ruleProvider = new MockRuleProvider([]);
      const engine = new BillingEngine(ruleProvider);

      const context = {
        serviceId: 'test-service',
        operation: 'test-op',
        meta: {
          path: '/unknown',
          method: 'GET'
        }
      };

      expect(engine.isDeferredByContext(context)).toBe(false);
    });

    it('should return false for pre-flight rules', () => {
      const rule: BillingRule = {
        id: 'test-pre-flight',
        when: { path: '/echo', method: 'GET' },
        strategy: {
          type: 'PerRequest',
          price: '1000000000000'
        }
      };

      const ruleProvider = new MockRuleProvider([rule]);
      const engine = new BillingEngine(ruleProvider);

      const context = {
        serviceId: 'test-service',
        operation: 'test-op',
        meta: {
          path: '/echo',
          method: 'GET'
        }
      };

      expect(engine.isDeferredByContext(context)).toBe(false);
    });

    it('should return true for post-flight rules', () => {
      const rule: BillingRule = {
        id: 'test-post-flight',
        when: { path: '/chat', method: 'POST' },
        strategy: {
          type: 'PerToken',
          unitPricePicoUSD: '100000000',
          usageKey: 'usage.total_tokens'
        }
      };

      const ruleProvider = new MockRuleProvider([rule]);
      const engine = new BillingEngine(ruleProvider);

      const context = {
        serviceId: 'test-service',
        operation: 'test-op',
        meta: {
          path: '/chat',
          method: 'POST'
        }
      };

      expect(engine.isDeferredByContext(context)).toBe(true);
    });
  });

  describe('Strategy deferred property', () => {
    it('PerRequestStrategy should have deferred = false', () => {
      const strategy = new PerRequestStrategy({ price: '1000' });
      expect(strategy.deferred).toBe(false);
    });

    it('PerTokenStrategy should have deferred = true', () => {
      const strategy = new PerTokenStrategy({
        unitPricePicoUSD: '100',
        usageKey: 'usage.total_tokens'
      });
      expect(strategy.deferred).toBe(true);
    });
  });

  describe('End-to-end billing flow', () => {
    it('should handle pre-flight billing correctly', async () => {
      const rule: BillingRule = {
        id: 'e2e-pre-flight',
        strategy: {
          type: 'PerRequest',
          price: '5000000000000' // 5 picoUSD
        }
      };

      const ruleProvider = new MockRuleProvider([rule]);
      const engine = new BillingEngine(ruleProvider);

      // Verify it's not deferred
      expect(engine.isDeferred(rule)).toBe(false);

      // Calculate cost immediately (pre-flight)
      const context = {
        serviceId: 'test-service',
        operation: 'upload',
        meta: {
          path: '/upload',
          method: 'POST'
        }
      };

      const cost = await engine.calcCostByRule(context, rule);
      expect(cost).toBe(5000000000000n);
    });

    it('should handle post-flight billing correctly', async () => {
      const rule: BillingRule = {
        id: 'e2e-post-flight',
        strategy: {
          type: 'PerToken',
          unitPricePicoUSD: '2000000000', // 2 picoUSD per token
          usageKey: 'usage.total_tokens'
        }
      };

      const ruleProvider = new MockRuleProvider([rule]);
      const engine = new BillingEngine(ruleProvider);

      // Verify it's deferred
      expect(engine.isDeferred(rule)).toBe(true);

      // Calculate cost with usage data (post-flight)
      const context = {
        serviceId: 'test-service',
        operation: 'chat',
        meta: {
          path: '/chat',
          method: 'POST',
          usage: {
            total_tokens: 150
          }
        }
      };

      const cost = await engine.calcCostByRule(context, rule);
      expect(cost).toBe(300000000000n); // 150 tokens * 2 picoUSD
    });
  });
});