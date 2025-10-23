import { OpenAIProvider } from '../../src/providers/openai.js';
import { ClaudeProvider } from '../../src/providers/claude.js';
import OpenRouterService from '../../src/services/openrouter.js';
import LiteLLMService from '../../src/services/litellm.js';

describe('Request ID Extraction', () => {
  describe('OpenAI Provider', () => {
    const provider = new OpenAIProvider();

    test('should extract x-request-id', () => {
      const headers = { 'x-request-id': 'openai-test-id-123' };
      const requestId = (provider as any).extractRequestIdFromHeaders(headers);
      expect(requestId).toBe('openai-test-id-123');
    });

    test('should extract x-openai-request-id', () => {
      const headers = { 'x-openai-request-id': 'openai-specific-123' };
      const requestId = (provider as any).extractRequestIdFromHeaders(headers);
      expect(requestId).toBe('openai-specific-123');
    });

    test('should prioritize x-request-id over x-openai-request-id', () => {
      const headers = {
        'x-request-id': 'standard-id',
        'x-openai-request-id': 'openai-id'
      };
      const requestId = (provider as any).extractRequestIdFromHeaders(headers);
      expect(requestId).toBe('standard-id');
    });

    test('should return undefined for missing headers', () => {
      const headers = { 'content-type': 'application/json' };
      const requestId = (provider as any).extractRequestIdFromHeaders(headers);
      expect(requestId).toBeUndefined();
    });

    test('should handle null/undefined headers', () => {
      expect((provider as any).extractRequestIdFromHeaders(null)).toBeUndefined();
      expect((provider as any).extractRequestIdFromHeaders(undefined)).toBeUndefined();
    });
  });

  describe('Claude Provider', () => {
    const provider = new ClaudeProvider();

    test('should extract x-request-id', () => {
      const headers = { 'x-request-id': 'claude-test-id-123' };
      const requestId = (provider as any).extractRequestIdFromHeaders(headers);
      expect(requestId).toBe('claude-test-id-123');
    });

    test('should extract anthropic-request-id', () => {
      const headers = { 'anthropic-request-id': 'anthropic-123' };
      const requestId = (provider as any).extractRequestIdFromHeaders(headers);
      expect(requestId).toBe('anthropic-123');
    });

    test('should extract request-id', () => {
      const headers = { 'request-id': 'generic-123' };
      const requestId = (provider as any).extractRequestIdFromHeaders(headers);
      expect(requestId).toBe('generic-123');
    });

    test('should prioritize standard headers', () => {
      const headers = {
        'x-request-id': 'standard-id',
        'request-id': 'generic-id',
        'anthropic-request-id': 'anthropic-id'
      };
      const requestId = (provider as any).extractRequestIdFromHeaders(headers);
      expect(requestId).toBe('standard-id');
    });
  });

  describe('OpenRouter Service', () => {
    const service = new OpenRouterService();

    test('should extract x-request-id', () => {
      const headers = { 'x-request-id': 'or-test-id-123' };
      const requestId = (service as any).extractRequestIdFromHeaders(headers);
      expect(requestId).toBe('or-test-id-123');
    });

    test('should extract openrouter-request-id', () => {
      const headers = { 'openrouter-request-id': 'or-specific-123' };
      const requestId = (service as any).extractRequestIdFromHeaders(headers);
      expect(requestId).toBe('or-specific-123');
    });

    test('should extract x-openai-request-id (OpenRouter compatibility)', () => {
      const headers = { 'x-openai-request-id': 'openai-compat-123' };
      const requestId = (service as any).extractRequestIdFromHeaders(headers);
      expect(requestId).toBe('openai-compat-123');
    });

    test('should prioritize standard x-request-id', () => {
      const headers = {
        'x-request-id': 'standard-id',
        'x-openai-request-id': 'openai-id',
        'openrouter-request-id': 'or-id'
      };
      const requestId = (service as any).extractRequestIdFromHeaders(headers);
      expect(requestId).toBe('standard-id');
    });
  });

  describe('LiteLLM Service', () => {
    const service = new LiteLLMService();

    test('should extract x-request-id', () => {
      const headers = { 'x-request-id': 'litellm-test-id-123' };
      const requestId = (service as any).extractRequestIdFromHeaders(headers);
      expect(requestId).toBe('litellm-test-id-123');
    });

    test('should handle case-sensitive headers correctly', () => {
      const headers = { 'X-Request-Id': 'case-sensitive-id' };
      // LiteLLM typically uses lowercase headers
      const requestId = (service as any).extractRequestIdFromHeaders(headers);
      // Should not match because headers are case-sensitive in this implementation
      expect(requestId).toBeUndefined();
    });
  });

  describe('Header Priority Order', () => {
    const provider = new OpenAIProvider();

    test('should follow correct priority: x-request-id > x-openai-request-id > openrouter-request-id > request-id > anthropic-request-id', () => {
      const testCases = [
        {
          headers: { 'x-request-id': 'a', 'x-openai-request-id': 'b', 'openrouter-request-id': 'c', 'request-id': 'd', 'anthropic-request-id': 'e' },
          expected: 'a'
        },
        {
          headers: { 'x-openai-request-id': 'b', 'openrouter-request-id': 'c', 'request-id': 'd', 'anthropic-request-id': 'e' },
          expected: 'b'
        },
        {
          headers: { 'openrouter-request-id': 'c', 'request-id': 'd', 'anthropic-request-id': 'e' },
          expected: 'c'
        },
        {
          headers: { 'request-id': 'd', 'anthropic-request-id': 'e' },
          expected: 'd'
        },
        {
          headers: { 'anthropic-request-id': 'e' },
          expected: 'e'
        }
      ];

      for (const testCase of testCases) {
        const requestId = (provider as any).extractRequestIdFromHeaders(testCase.headers);
        expect(requestId).toBe(testCase.expected);
      }
    });
  });

  describe('Edge Cases', () => {
    const provider = new OpenAIProvider();

    test('should handle empty string values', () => {
      const headers = { 'x-request-id': '' };
      const requestId = (provider as any).extractRequestIdFromHeaders(headers);
      // Empty string is falsy, should fall through to next header or undefined
      expect(requestId).toBeFalsy();
    });

    test('should handle whitespace-only values', () => {
      const headers = { 'x-request-id': '   ' };
      const requestId = (provider as any).extractRequestIdFromHeaders(headers);
      // Whitespace string is truthy, should be returned
      expect(requestId).toBe('   ');
    });

    test('should handle numeric request IDs', () => {
      const headers = { 'x-request-id': 12345 };
      const requestId = (provider as any).extractRequestIdFromHeaders(headers);
      expect(requestId).toBe(12345);
    });

    test('should handle empty object', () => {
      const headers = {};
      const requestId = (provider as any).extractRequestIdFromHeaders(headers);
      expect(requestId).toBeUndefined();
    });
  });
});

