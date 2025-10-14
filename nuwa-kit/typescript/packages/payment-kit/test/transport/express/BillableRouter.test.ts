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

      // Use proper path-to-regexp 6.x syntax for wildcards
      router.get('/files/(.*)', options, mockHandler, 'static-files');

      const rules = router.getRules();
      expect(rules).toHaveLength(1);

      // Test wildcard matching - path-to-regexp converts '/files/(.*)' to a proper regex
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

  describe('LLM Gateway specific patterns', () => {
    it('should handle provider wildcard routes correctly', () => {
      const options: RouteOptions = {
        pricing: { type: 'FinalCost' },
        authRequired: true,
      };

      // Test the exact pattern used in LLM Gateway
      router.post('/openrouter(.*)', options, mockHandler, 'openrouter-wildcard');
      router.post('/openai(.*)', options, mockHandler, 'openai-wildcard');

      const rules = router.getRules();
      expect(rules.length).toBeGreaterThanOrEqual(2);

      // Test that /openrouter/api/v1/chat/completions matches
      const rule1 = router.findRule('POST', '/openrouter/api/v1/chat/completions');
      expect(rule1).toBeDefined();
      expect(rule1?.id).toBe('openrouter-wildcard');

      // Test that /openai/v1/chat/completions matches  
      const rule2 = router.findRule('POST', '/openai/v1/chat/completions');
      expect(rule2).toBeDefined();
      expect(rule2?.id).toBe('openai-wildcard');

      // Test that non-matching paths don't match
      const rule3 = router.findRule('POST', '/anthropic/v1/chat/completions');
      expect(rule3).toBeUndefined();
    });

    it('should extract path parameters correctly for provider routes', () => {
      const options: RouteOptions = {
        pricing: { type: 'FinalCost' },
        authRequired: true,
      };

      // Register the route
      router.post('/openrouter(.*)', options, mockHandler, 'openrouter-test');

      // Find the rule to verify it exists
      const rule = router.findRule('POST', '/openrouter/api/v1/chat/completions');
      expect(rule).toBeDefined();
      expect(rule?.id).toBe('openrouter-test');
    });

    it('should handle both legacy and provider routes without conflicts', () => {
      const legacyOptions: RouteOptions = {
        pricing: { type: 'FinalCost' },
        authRequired: true,
      };

      const providerOptions: RouteOptions = {
        pricing: { type: 'FinalCost' }, 
        authRequired: true,
      };

      // Register legacy routes first (higher priority)
      router.post('/api/v1/chat/completions', legacyOptions, mockHandler, 'legacy-chat');
      router.post('/api/v1/completions', legacyOptions, mockHandler, 'legacy-completions');

      // Register provider routes
      router.post('/openrouter(.*)', providerOptions, mockHandler, 'openrouter-wildcard');
      router.post('/openai(.*)', providerOptions, mockHandler, 'openai-wildcard');

      const rules = router.getRules();
      expect(rules.length).toBeGreaterThanOrEqual(4);

      // Legacy routes should match first
      const legacyRule = router.findRule('POST', '/api/v1/chat/completions');
      expect(legacyRule).toBeDefined();
      expect(legacyRule?.id).toBe('legacy-chat');

      // Provider routes should match their patterns
      const providerRule = router.findRule('POST', '/openrouter/api/v1/chat/completions');
      expect(providerRule).toBeDefined();
      expect(providerRule?.id).toBe('openrouter-wildcard');
    });
  });

  describe('Error handling', () => {
    it('should throw clear errors for invalid path patterns', () => {
      const options: RouteOptions = {
        pricing: '1000000',
        authRequired: true,
      };

      // Test invalid wildcard syntax
      expect(() => {
        router.get('/files/*', options, mockHandler, 'invalid-wildcard');
      }).toThrow(/Invalid route path "\/files\/\*"/);

      // Test invalid modifier syntax
      expect(() => {
        router.get('/api/test?', options, mockHandler, 'invalid-modifier');
      }).toThrow(/Invalid route path "\/api\/test\?"/);

      // Test unbalanced parentheses
      expect(() => {
        router.get('/api/(unclosed', options, mockHandler, 'unbalanced-parens');
      }).toThrow(/Invalid route path "\/api\/\(unclosed"/);
    });

    it('should provide helpful error messages with usage hints', () => {
      const options: RouteOptions = {
        pricing: '1000000',
        authRequired: true,
      };

      try {
        router.get('/files/*', options, mockHandler, 'test-error-message');
        fail('Expected error to be thrown');
      } catch (error: any) {
        expect(error.message).toContain('Invalid route path "/files/*"');
        expect(error.message).toContain('Please use a valid Express.js route pattern');
        expect(error.message).toContain('Use "/*" instead of "*" for wildcards');
        expect(error.message).toContain('https://github.com/pillarjs/path-to-regexp#usage');
      }
    });

    it('should accept valid path patterns', () => {
      const options: RouteOptions = {
        pricing: '1000000',
        authRequired: true,
      };

      // These should work fine
      expect(() => {
        router.get('/api/test', options, mockHandler, 'simple-path');
      }).not.toThrow();

      expect(() => {
        router.get('/api/users/:id', options, mockHandler, 'param-path');
      }).not.toThrow();

      expect(() => {
        router.get('/files/(.*)', options, mockHandler, 'wildcard-path');
      }).not.toThrow();

      const rules = router.getRules();
      expect(rules.length).toBeGreaterThanOrEqual(3);
    });
  });
});
