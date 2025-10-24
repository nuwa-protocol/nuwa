/**
 * Unit tests for route patterns
 * Tests route matching and validation logic
 */

describe('Route Patterns Unit Tests', () => {
  describe('Provider Route Matching', () => {
    it('should validate provider route patterns', () => {
      // Test the new provider-first route format: /:provider/*
      const providerRoutes = [
        '/openai/v1/chat/completions',
        '/openrouter/api/v1/chat/completions',
        '/litellm/api/v1/chat/completions',
        '/openai/v1/embeddings',
        '/claude/v1/messages',
      ];

      // In a real Express app, these would be handled by the router
      providerRoutes.forEach(route => {
        const match = route.match(/^\/([^\/]+)\/(.*)/);
        expect(match).toBeTruthy();
        expect(match![1]).toMatch(/^(openai|openrouter|litellm|claude)$/);
      });
    });
  });

  describe('Route Pattern Extraction', () => {
    it('should extract provider and path from routes', () => {
      const testCases = [
        {
          route: '/openai/v1/chat/completions',
          expectedProvider: 'openai',
          expectedPath: '/v1/chat/completions',
        },
        {
          route: '/openrouter/api/v1/models',
          expectedProvider: 'openrouter',
          expectedPath: '/api/v1/models',
        },
        {
          route: '/claude/v1/messages',
          expectedProvider: 'claude',
          expectedPath: '/v1/messages',
        },
      ];

      testCases.forEach(({ route, expectedProvider, expectedPath }) => {
        const match = route.match(/^\/([^\/]+)(\/.*)/);
        expect(match).toBeTruthy();
        expect(match![1]).toBe(expectedProvider);
        expect(match![2]).toBe(expectedPath);
      });
    });
  });
});
