/**
 * Unit tests for pricing system
 * Tests pricing registry functionality and cost calculations
 */

import { pricingRegistry } from '../../src/billing/pricing.js';

describe('Pricing System Unit Tests', () => {
  describe('Default Pricing Configuration', () => {
    it('should have default OpenAI pricing', () => {
      const gpt4Pricing = pricingRegistry.getPricing('gpt-4');
      expect(gpt4Pricing).toBeTruthy();
      expect(gpt4Pricing?.promptPerMTokUsd).toBe(30.0);
      expect(gpt4Pricing?.completionPerMTokUsd).toBe(60.0);

      const gpt35Pricing = pricingRegistry.getPricing('gpt-3.5-turbo');
      expect(gpt35Pricing).toBeTruthy();
      expect(gpt35Pricing?.promptPerMTokUsd).toBe(0.5);
      expect(gpt35Pricing?.completionPerMTokUsd).toBe(1.5);
    });

    it('should handle model family patterns', () => {
      const gpt4oPricing = pricingRegistry.getPricing('gpt-4o-2024-05-13');
      expect(gpt4oPricing).toBeTruthy();
      expect(gpt4oPricing?.promptPerMTokUsd).toBe(5.0);

      const gpt35Pricing = pricingRegistry.getPricing('gpt-3.5-turbo-0125');
      expect(gpt35Pricing).toBeTruthy();
      expect(gpt35Pricing?.promptPerMTokUsd).toBe(0.5);
    });
  });

  describe('Cost Calculations', () => {
    it('should calculate costs correctly', () => {
      const usage = {
        promptTokens: 1000,
        completionTokens: 500,
        totalTokens: 1500
      };

      const result = pricingRegistry.calculateCost('gpt-4', usage);
      expect(result).toBeTruthy();
      expect(result?.costUsd).toBeCloseTo(0.060); // (1000/1M * 30) + (500/1M * 60) = 0.03 + 0.03 = 0.06
      expect(result?.source).toBe('gateway-pricing');
    });
  });

  describe('Registry Functionality', () => {
    it('should load pricing configuration', () => {
      expect(pricingRegistry).toBeDefined();
      expect(typeof pricingRegistry.getVersion).toBe('function');
      expect(typeof pricingRegistry.getPricing).toBe('function');
    });

    it('should have valid version string', () => {
      const version = pricingRegistry.getVersion();
      expect(version).toBeDefined();
      expect(typeof version).toBe('string');
      expect(version.length).toBeGreaterThan(0);
    });

    it('should return null for unknown model', () => {
      const pricing = pricingRegistry.getPricing('unknown-model');
      expect(pricing).toBeNull();
    });
  });

  describe('Cost Calculations - Extended', () => {
    it('should calculate cost with proper model and source info', () => {
      const result = pricingRegistry.calculateCost('gpt-4', {
        promptTokens: 1000,
        completionTokens: 500,
      });

      expect(result).toBeDefined();
      expect(result?.costUsd).toBeGreaterThan(0);
      expect(result?.source).toBe('gateway-pricing');
      expect(result?.model).toBe('gpt-4');
    });

    it('should get pricing for gpt-4 with specific values', () => {
      const pricing = pricingRegistry.getPricing('gpt-4');
      expect(pricing).toBeDefined();
      expect(pricing?.promptPerMTokUsd).toBeGreaterThan(0);
      expect(pricing?.completionPerMTokUsd).toBeGreaterThan(0);
    });
  });

  describe('Pricing Overrides', () => {
    it('should support pricing overrides via updatePricing', () => {
      // Test pricing override functionality
      const originalGpt4Pricing = pricingRegistry.getPricing('gpt-4');
      
      // Simulate environment override
      pricingRegistry.updatePricing('gpt-4-test', {
        promptPerMTokUsd: 25.0,
        completionPerMTokUsd: 50.0
      });

      const overriddenPricing = pricingRegistry.getPricing('gpt-4-test');
      expect(overriddenPricing?.promptPerMTokUsd).toBe(25.0);
      expect(overriddenPricing?.completionPerMTokUsd).toBe(50.0);
    });
  });
});
