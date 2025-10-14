// import { describe, test, expect } from 'jest';
import { pricingRegistry } from '../src/billing/pricing';

describe('Pricing System', () => {
  test('should load pricing configuration', () => {
    expect(pricingRegistry).toBeDefined();
    expect(typeof pricingRegistry.getVersion).toBe('function');
    expect(typeof pricingRegistry.getPricing).toBe('function');
  });

  test('should get pricing for gpt-4', () => {
    const pricing = pricingRegistry.getPricing('gpt-4');
    expect(pricing).toBeDefined();
    expect(pricing?.promptPerMTokUsd).toBeGreaterThan(0);
    expect(pricing?.completionPerMTokUsd).toBeGreaterThan(0);
  });

  test('should calculate cost correctly', () => {
    const result = pricingRegistry.calculateCost('gpt-4', {
      promptTokens: 1000,
      completionTokens: 500,
    });

    expect(result).toBeDefined();
    expect(result?.costUsd).toBeGreaterThan(0);
    expect(result?.source).toBe('gateway-pricing');
    expect(result?.model).toBe('gpt-4');
  });

  test('should return null for unknown model', () => {
    const pricing = pricingRegistry.getPricing('unknown-model');
    expect(pricing).toBeNull();
  });

  test('should have valid version string', () => {
    const version = pricingRegistry.getVersion();
    expect(version).toBeDefined();
    expect(typeof version).toBe('string');
    expect(version.length).toBeGreaterThan(0);
  });
});
