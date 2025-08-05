import { describe, it, expect, beforeEach, afterEach, jest } from '@jest/globals';
import { BillableRouter } from '../BillableRouter';
import express, { Request, Response } from 'express';
import { BillingRule, BillingConfig, StrategyConfig } from '../../../billing/types';

describe('BillableRouter', () => {
  let router: BillableRouter;
  let mockHandler: jest.MockedFunction<(req: Request, res: Response) => void>;

  beforeEach(() => {
    mockHandler = jest.fn();
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  describe('Basic instantiation', () => {
    it('should create router with basic options', () => {
      router = new BillableRouter({ serviceId: 'test-service' });
      expect(router).toBeDefined();
      expect(router.router).toBeDefined();
      expect(router.getRules()).toEqual([]);
    });

    it('should create router with default pricing', () => {
      const defaultPrice = 1_000_000_000n; // 1 USD in picoUSD
      router = new BillableRouter({ 
        serviceId: 'test-service',
        defaultPricePicoUSD: defaultPrice
      });

      const rules = router.getRules();
      expect(rules).toHaveLength(1);
      expect(rules[0]).toEqual({
        id: 'default-pricing',
        default: true,
        strategy: {
          type: 'PerRequest',
          price: defaultPrice.toString()
        },
        authRequired: true,
        adminOnly: false,
        paymentRequired: true
      });
    });

    it('should accept string default price', () => {
      router = new BillableRouter({ 
        serviceId: 'test-service',
        defaultPricePicoUSD: '2000000000'
      });

      const rules = router.getRules();
      expect(rules[0].strategy.price).toBe('2000000000');
    });

    it('should set custom version', () => {
      router = new BillableRouter({ 
        serviceId: 'test-service',
        version: 2
      });

      const configLoader = router.getConfigLoader();
      configLoader.load('test-service').then(config => {
        expect(config.version).toBe(2);
      });
    });
  });

  describe('Route registration', () => {
    beforeEach(() => {
      router = new BillableRouter({ serviceId: 'test-service' });
    });

    it('should register GET route with bigint pricing', () => {
      const price = 500_000_000n; // 0.5 USD
      router.get('/api/test', price, mockHandler);

      const rules = router.getRules();
      expect(rules).toHaveLength(1);
      expect(rules[0]).toEqual({
        id: 'get:/api/test',
        when: {
          path: '/api/test',
          method: 'GET'
        },
        strategy: {
          type: 'PerRequest',
          price: price.toString()
        },
        authRequired: true,
        adminOnly: false,
        paymentRequired: true
      });
    });

    it('should register POST route with string pricing', () => {
      router.post('/api/create', '1000000000', mockHandler);

      const rules = router.getRules();
      expect(rules[0].when?.method).toBe('POST');
      expect(rules[0].when?.path).toBe('/api/create');
      expect(rules[0].strategy.price).toBe('1000000000');
    });

    it('should register route with custom strategy config', () => {
      const strategy: StrategyConfig = {
        type: 'PerToken',
        inputTokenPrice: '100000',
        outputTokenPrice: '200000'
      };

      router.put('/api/update', strategy, mockHandler, 'custom-update');

      const rules = router.getRules();
      expect(rules[0]).toEqual({
        id: 'custom-update',
        when: {
          path: '/api/update',
          method: 'PUT'
        },
        strategy,
        authRequired: false,
        adminOnly: false,
        paymentRequired: true
      });
    });

    it('should register all HTTP methods', () => {
      router.get('/get', 100n, mockHandler);
      router.post('/post', 200n, mockHandler);
      router.put('/put', 300n, mockHandler);
      router.delete('/delete', 400n, mockHandler);
      router.patch('/patch', 500n, mockHandler);

      const rules = router.getRules();
      expect(rules).toHaveLength(5);
      
      const methods = rules.map(r => r.when?.method);
      expect(methods).toContain('GET');
      expect(methods).toContain('POST');
      expect(methods).toContain('PUT');
      expect(methods).toContain('DELETE');
      expect(methods).toContain('PATCH');
    });

    it('should generate automatic rule IDs', () => {
      router.get('/api/v1/users', 100n, mockHandler);
      router.post('/api/v1/users', 200n, mockHandler);

      const rules = router.getRules();
      expect(rules[0].id).toBe('get:/api/v1/users');
      expect(rules[1].id).toBe('post:/api/v1/users');
    });

    it('should use custom rule ID when provided', () => {
      router.get('/api/test', 100n, mockHandler, 'my-custom-id');

      const rules = router.getRules();
      expect(rules[0].id).toBe('my-custom-id');
    });
  });

  describe('Rule ordering logic', () => {
    beforeEach(() => {
      router = new BillableRouter({ 
        serviceId: 'test-service',
        defaultPricePicoUSD: 1_000_000_000n // Default rule
      });
    });

    it('should place specific rules before default rules', () => {
      // Add a specific route
      router.get('/api/specific', 500_000_000n, mockHandler);
      
      const rules = router.getRules();
      expect(rules).toHaveLength(2);
      
      // Specific rule should come first
      expect(rules[0].id).toBe('get:/api/specific');
      expect(rules[0].default).toBeUndefined();
      
      // Default rule should come last
      expect(rules[1].id).toBe('default-pricing');
      expect(rules[1].default).toBe(true);
    });

    it('should maintain order when adding multiple specific routes', () => {
      router.get('/api/first', 100n, mockHandler);
      router.post('/api/second', 200n, mockHandler);
      router.put('/api/third', 300n, mockHandler);

      const rules = router.getRules();
      expect(rules).toHaveLength(4); // 3 specific + 1 default

      // All specific rules should come before default, in registration order
      expect(rules[0].id).toBe('get:/api/first'); // First registered
      expect(rules[1].id).toBe('post:/api/second'); // Second registered  
      expect(rules[2].id).toBe('put:/api/third'); // Third registered
      expect(rules[3].id).toBe('default-pricing'); // Default always last
    });

    it('should handle no default rule correctly', () => {
      router = new BillableRouter({ serviceId: 'test-service' }); // No default
      
      router.get('/api/test', 100n, mockHandler);
      router.post('/api/test2', 200n, mockHandler);

      const rules = router.getRules();
      expect(rules).toHaveLength(2);
      expect(rules.every(r => !r.default)).toBe(true);
    });
  });

  describe('ConfigLoader integration', () => {
    beforeEach(() => {
      router = new BillableRouter({ 
        serviceId: 'llm-gateway',
        version: 2,
        defaultPricePicoUSD: 1_000_000_000n
      });

      router.get('/v1/chat/completions', 5_000_000_000n, mockHandler);
      router.post('/v1/embeddings', 1_000_000_000n, mockHandler);
    });

    it('should create valid config loader', async () => {
      const configLoader = router.getConfigLoader();
      expect(configLoader).toBeDefined();
      expect(typeof configLoader.load).toBe('function');
    });

    it('should load correct configuration', async () => {
      const configLoader = router.getConfigLoader();
      const config = await configLoader.load('llm-gateway');

      expect(config).toEqual({
        version: 2,
        serviceId: 'llm-gateway',
        rules: [
          {
            id: 'get:/v1/chat/completions',
            when: { path: '/v1/chat/completions', method: 'GET' },
            strategy: { type: 'PerRequest', price: '5000000000' },
            authRequired: true,
            adminOnly: false,
            paymentRequired: true
          },
          {
            id: 'post:/v1/embeddings',
            when: { path: '/v1/embeddings', method: 'POST' },
            strategy: { type: 'PerRequest', price: '1000000000' },
            authRequired: true,
            adminOnly: false,
            paymentRequired: true
          },
          {
            id: 'default-pricing',
            default: true,
            strategy: { type: 'PerRequest', price: '1000000000' },
            authRequired: true,
            adminOnly: false,
            paymentRequired: true
          }
        ]
      });
    });

    it('should reject mismatched service ID', async () => {
      const configLoader = router.getConfigLoader();
      
      await expect(configLoader.load('wrong-service'))
        .rejects
        .toThrow('BillableRouter config loader mismatch: expected llm-gateway, got wrong-service');
    });
  });

  describe('Express router integration', () => {
    beforeEach(() => {
      router = new BillableRouter({ serviceId: 'test-service' });
    });

    it('should create valid Express router', () => {
      expect(router.router).toBeDefined();
      expect(typeof router.router.use).toBe('function');
      expect(typeof router.router.get).toBe('function');
      expect(typeof router.router.post).toBe('function');
    });

    it('should register routes on underlying Express router', () => {
      const routerSpy = jest.spyOn(router.router, 'get');
      
      router.get('/api/test', 100n, mockHandler);
      
      expect(routerSpy).toHaveBeenCalledWith('/api/test', mockHandler);
    });

    it('should allow chaining', () => {
      const result = router
        .get('/api/get', 100n, mockHandler)
        .post('/api/post', 200n, mockHandler)
        .put('/api/put', 300n, mockHandler);

      expect(result).toBe(router);
      expect(router.getRules()).toHaveLength(3);
    });
  });

  describe('Edge cases and error handling', () => {
    beforeEach(() => {
      router = new BillableRouter({ serviceId: 'test-service' });
    });

    it('should handle zero pricing', () => {
      router.get('/free-endpoint', 0n, mockHandler);

      const rules = router.getRules();
      expect(rules[0].strategy.price).toBe('0');
    });

    it('should handle very large pricing values', () => {
      const largePrice = BigInt('999999999999999999999');
      router.get('/expensive', largePrice, mockHandler);

      const rules = router.getRules();
      expect(rules[0].strategy.price).toBe(largePrice.toString());
    });

    it('should handle complex path patterns', () => {
      router.get('/api/v1/users/:id/posts/:postId', 100n, mockHandler);

      const rules = router.getRules();
      expect(rules[0].when?.path).toBe('/api/v1/users/:id/posts/:postId');
    });

    it('should handle special characters in paths', () => {
      router.get('/api/search?query=test&limit=10', 100n, mockHandler);

      const rules = router.getRules();
      expect(rules[0].when?.path).toBe('/api/search?query=test&limit=10');
    });
  });

  describe('Console logging validation', () => {
    let consoleSpy: any;

    beforeEach(() => {
      consoleSpy = jest.spyOn(console, 'log').mockImplementation(() => {});
      router = new BillableRouter({ serviceId: 'test-service' });
    });

    afterEach(() => {
      consoleSpy.mockRestore();
    });

    it('should log route registration', () => {
      router.get('/api/test', 100n, mockHandler);

      expect(consoleSpy).toHaveBeenCalledWith(
        '🔧 Registering route: GET /api/test with options:',
        100n
      );
    });

    it('should log rule creation', () => {
      router.get('/api/test', 100n, mockHandler);

      expect(consoleSpy).toHaveBeenCalledWith(
        '📝 Created rule:',
        expect.objectContaining({
          id: 'get:/api/test',
          when: { path: '/api/test', method: 'GET' }
        })
      );
    });

    it('should log rule addition', () => {
      router.get('/api/test', 100n, mockHandler);

      expect(consoleSpy).toHaveBeenCalledWith(
        '📌 Adding specific rule to end:',
        'get:/api/test'
      );
    });

    it('should log final rule count', () => {
      router.get('/api/test', 100n, mockHandler);

      expect(consoleSpy).toHaveBeenCalledWith(
        '📋 Total rules after registration: 1',
        ['get:/api/test']
      );
    });
  });
}); 