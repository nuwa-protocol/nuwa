import { BillableRouter, RouteOptions } from '../../../src/transport/express/BillableRouter';
import { RequestHandler } from 'express';

// Mock express request handler
const mockHandler: RequestHandler = (req, res, next) => {
  res.json({ message: 'test' });
};

describe('BillableRouter', () => {
  let router: BillableRouter;

  beforeEach(() => {
    router = new BillableRouter({
      serviceId: 'test-service',
      // Don't add default pricing to keep tests simple
    });
  });

  describe('String path registration', () => {
    it('should register routes with string paths', () => {
      const options: RouteOptions = {
        pricing: '1000000',
        authRequired: true,
      };

      router.post('/api/test', options, mockHandler, 'test-rule');

      const rules = router.getRules();
      expect(rules).toHaveLength(1);
      expect(rules[0].id).toBe('test-rule');
      expect(rules[0].when?.pathRegex).toBeDefined();
      expect(rules[0].when?.method).toBe('POST');
    });

    it('should convert Express parameter routes to regex', () => {
      const options: RouteOptions = {
        pricing: '2000000',
        authRequired: true,
      };

      router.get('/users/:id', options, mockHandler, 'user-detail');

      const rules = router.getRules();
      expect(rules).toHaveLength(1);
      expect(rules[0].when?.pathRegex).toBeDefined();

      // Test that the generated regex matches expected paths
      const rule = router.findRule('GET', '/users/123');
      expect(rule).toBeDefined();
      expect(rule?.id).toBe('user-detail');
    });

    it('should handle wildcard routes', () => {
      const options: RouteOptions = {
        pricing: '500000',
        authRequired: false,
      };

      router.get('/files/*', options, mockHandler, 'static-files');

      const rules = router.getRules();
      expect(rules).toHaveLength(1);

      // Test wildcard matching - path-to-regexp converts '/files/*' to a proper regex
      const rule1 = router.findRule('GET', '/files/images/test.png');
      expect(rule1).toBeDefined();
      expect(rule1?.id).toBe('static-files');

      const rule2 = router.findRule('GET', '/files/docs/readme.md');
      expect(rule2).toBeDefined();
      expect(rule2?.id).toBe('static-files');

      // Should not match paths that don't start with /files/
      const rule3 = router.findRule('GET', '/other/test.png');
      expect(rule3).toBeUndefined();
    });

    it('should handle complex parameter patterns', () => {
      const options: RouteOptions = {
        pricing: '3000000',
        authRequired: true,
      };

      router.post('/v1/:provider/chat/completions', options, mockHandler, 'llm-proxy');

      const rules = router.getRules();
      expect(rules).toHaveLength(1);

      // Test parameter matching
      const rule1 = router.findRule('POST', '/v1/openai/chat/completions');
      expect(rule1).toBeDefined();
      expect(rule1?.id).toBe('llm-proxy');

      const rule2 = router.findRule('POST', '/v1/anthropic/chat/completions');
      expect(rule2).toBeDefined();
      expect(rule2?.id).toBe('llm-proxy');

      // Should not match different paths
      const rule3 = router.findRule('POST', '/v2/openai/chat/completions');
      expect(rule3).toBeUndefined();
    });
  });

  describe('RegExp path registration', () => {
    it('should register routes with RegExp paths', () => {
      const options: RouteOptions = {
        pricing: '1500000',
        authRequired: true,
      };

      const pathRegex = /^\/v1\/([^\/]+)\/chat\/completions$/;
      router.post(pathRegex, options, mockHandler, 'regex-route');

      const rules = router.getRules();
      expect(rules).toHaveLength(1);
      expect(rules[0].id).toBe('regex-route');
      expect(rules[0].when?.pathRegex).toBe(pathRegex.source);
    });

    it('should match RegExp paths correctly', () => {
      const options: RouteOptions = {
        pricing: '2500000',
        authRequired: true,
      };

      const pathRegex = /^\/api\/v(\d+)\/users\/(\d+)$/;
      router.get(pathRegex, options, mockHandler, 'versioned-api');

      // Test matching
      const rule1 = router.findRule('GET', '/api/v1/users/123');
      expect(rule1).toBeDefined();
      expect(rule1?.id).toBe('versioned-api');

      const rule2 = router.findRule('GET', '/api/v2/users/456');
      expect(rule2).toBeDefined();

      // Should not match non-numeric versions or users
      const rule3 = router.findRule('GET', '/api/vx/users/123');
      expect(rule3).toBeUndefined();

      const rule4 = router.findRule('GET', '/api/v1/users/abc');
      expect(rule4).toBeUndefined();
    });

    it('should handle complex RegExp patterns', () => {
      const options: RouteOptions = {
        pricing: '1000000',
        authRequired: false,
      };

      // Match paths ending with specific file extensions
      const pathRegex = /^\/static\/.*\.(jpg|jpeg|png|gif|svg)$/i;
      router.get(pathRegex, options, mockHandler, 'image-files');

      // Test case-insensitive matching
      const rule1 = router.findRule('GET', '/static/images/logo.PNG');
      expect(rule1).toBeDefined();
      expect(rule1?.id).toBe('image-files');

      const rule2 = router.findRule('GET', '/static/icons/arrow.svg');
      expect(rule2).toBeDefined();

      // Should not match other file types
      const rule3 = router.findRule('GET', '/static/docs/readme.txt');
      expect(rule3).toBeUndefined();
    });
  });

  describe('Mixed path types', () => {
    it('should handle both string and RegExp paths in the same router', () => {
      const stringOptions: RouteOptions = {
        pricing: '1000000',
        authRequired: true,
      };

      const regexOptions: RouteOptions = {
        pricing: '2000000',
        authRequired: true,
      };

      // Add string path
      router.get('/api/health', stringOptions, mockHandler, 'health-check');

      // Add RegExp path
      const pathRegex = /^\/api\/v\d+\/status$/;
      router.get(pathRegex, regexOptions, mockHandler, 'version-status');

      const rules = router.getRules();
      expect(rules).toHaveLength(2);

      // Test string path matching
      const rule1 = router.findRule('GET', '/api/health');
      expect(rule1).toBeDefined();
      expect(rule1?.id).toBe('health-check');

      // Test RegExp path matching
      const rule2 = router.findRule('GET', '/api/v1/status');
      expect(rule2).toBeDefined();
      expect(rule2?.id).toBe('version-status');

      const rule3 = router.findRule('GET', '/api/v42/status');
      expect(rule3).toBeDefined();
      expect(rule3?.id).toBe('version-status');
    });

    it('should respect rule priority (first match wins)', () => {
      const options1: RouteOptions = {
        pricing: '1000000',
        authRequired: true,
      };

      const options2: RouteOptions = {
        pricing: '2000000',
        authRequired: false,
      };

      // Add more specific rule first
      router.get('/api/users/admin', options1, mockHandler, 'admin-user');

      // Add more general rule second
      router.get('/api/users/:id', options2, mockHandler, 'general-user');

      // The more specific rule should match first
      const rule = router.findRule('GET', '/api/users/admin');
      expect(rule).toBeDefined();
      expect(rule?.id).toBe('admin-user');
      expect(rule?.strategy.price).toBe('1000000');
    });
  });

  describe('Route validation', () => {
    it('should validate route options correctly', () => {
      const validOptions: RouteOptions = {
        pricing: '1000000',
        authRequired: true,
        adminOnly: false,
      };

      expect(() => {
        router.post('/api/test', validOptions, mockHandler);
      }).not.toThrow();
    });

    it('should reject admin routes without authentication', () => {
      const invalidOptions: RouteOptions = {
        pricing: '0',
        authRequired: false,
        adminOnly: true, // Admin route but no auth
      };

      expect(() => {
        router.post('/api/admin', invalidOptions, mockHandler);
      }).toThrow('adminOnly requires authRequired to be true or undefined');
    });

    it('should allow paid routes to auto-enable authentication', () => {
      const options: RouteOptions = {
        pricing: '1000000', // Paid route
        // authRequired not specified - should auto-enable
      };

      expect(() => {
        router.post('/api/paid', options, mockHandler);
      }).not.toThrow();

      const rules = router.getRules();
      const rule = rules.find(r => r.id === 'POST:/api/paid');
      expect(rule?.authRequired).toBe(true); // Should be auto-enabled
    });
  });

  describe('Error handling', () => {
    it('should handle path-to-regexp conversion errors gracefully', () => {
      const options: RouteOptions = {
        pricing: '1000000',
        authRequired: true,
      };

      // Test with a simpler potentially problematic path that won't break Express
      expect(() => {
        router.get('/api/test?', options, mockHandler, 'questionmark-path');
      }).not.toThrow();

      const rules = router.getRules();
      expect(rules.length).toBeGreaterThan(0);
      expect(rules[0].when?.pathRegex).toBeDefined();
    });
  });
});
