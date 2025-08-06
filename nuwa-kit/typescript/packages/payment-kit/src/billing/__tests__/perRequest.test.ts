import { describe, it, expect } from '@jest/globals';
import { PerRequestStrategy } from '../strategies/perRequest';
import { BillingContext } from '../core/types';

describe('PerRequestStrategy', () => {
  it('should charge fixed price for any request', async () => {
    const strategy = new PerRequestStrategy({ price: '1000' });
    
    const ctx: BillingContext = {
      serviceId: 'test-service',
      operation: 'test-op',
      meta: {}
    };

    const cost = await strategy.evaluate(ctx);
    expect(cost).toBe(BigInt(1000));
  });

  it('should handle bigint price', async () => {
    const strategy = new PerRequestStrategy({ price: BigInt(2000) });
    
    const ctx: BillingContext = {
      serviceId: 'test-service',
      operation: 'test-op',
      meta: { someData: 'ignored' }
    };

    const cost = await strategy.evaluate(ctx);
    expect(cost).toBe(BigInt(2000));
  });

  it('should handle scientific notation price', async () => {
    const strategy = new PerRequestStrategy({ price: '5e12' });
    
    const ctx: BillingContext = {
      serviceId: 'test-service',
      operation: 'test-op',
      meta: {}
    };

    const cost = await strategy.evaluate(ctx);
    expect(cost).toBe(BigInt(5000000000000));
  });

  it('should return same cost regardless of context metadata', async () => {
    const strategy = new PerRequestStrategy({ price: 500 });
    
    const ctx1: BillingContext = {
      serviceId: 'service1',
      operation: 'op1',
      meta: { tokens: 100, model: 'gpt-4' }
    };

    const ctx2: BillingContext = {
      serviceId: 'service2',
      operation: 'op2',
      meta: { tokens: 1000, model: 'claude', path: '/api/v1' }
    };

    const cost1 = await strategy.evaluate(ctx1);
    const cost2 = await strategy.evaluate(ctx2);
    
    expect(cost1).toBe(BigInt(500));
    expect(cost2).toBe(BigInt(500));
    expect(cost1).toEqual(cost2);
  });
}); 