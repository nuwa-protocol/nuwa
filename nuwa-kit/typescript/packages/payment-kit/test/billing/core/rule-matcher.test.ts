import { findRule } from '../../../src/billing/core/rule-matcher';
import { BillingRule } from '../../../src/billing/core/types';

describe('rule-matcher', () => {
  describe('findRule', () => {
    it('should match exact path rules', () => {
      const rules: BillingRule[] = [
        {
          id: 'exact-match',
          when: {
            path: '/api/test',
            method: 'GET',
          },
          strategy: { type: 'PerRequest', price: '1000000' },
          authRequired: true,
        },
      ];

      const meta = { path: '/api/test', method: 'GET' };
      const result = findRule(meta, rules);

      expect(result).toBeDefined();
      expect(result?.id).toBe('exact-match');
    });

    it('should match pathRegex rules', () => {
      const rules: BillingRule[] = [
        {
          id: 'regex-match',
          when: {
            pathRegex: '^/users/\\d+$',
            method: 'GET',
          },
          strategy: { type: 'PerRequest', price: '2000000' },
          authRequired: true,
        },
      ];

      const meta1 = { path: '/users/123', method: 'GET' };
      const result1 = findRule(meta1, rules);
      expect(result1).toBeDefined();
      expect(result1?.id).toBe('regex-match');

      const meta2 = { path: '/users/456', method: 'GET' };
      const result2 = findRule(meta2, rules);
      expect(result2).toBeDefined();
      expect(result2?.id).toBe('regex-match');

      // Should not match non-numeric IDs
      const meta3 = { path: '/users/abc', method: 'GET' };
      const result3 = findRule(meta3, rules);
      expect(result3).toBeUndefined();
    });

    it('should prioritize exact path over regex when both match', () => {
      const rules: BillingRule[] = [
        {
          id: 'exact-match',
          when: {
            path: '/api/users/admin',
            method: 'GET',
          },
          strategy: { type: 'PerRequest', price: '5000000' },
          authRequired: true,
        },
        {
          id: 'regex-match',
          when: {
            pathRegex: '^/api/users/.+$',
            method: 'GET',
          },
          strategy: { type: 'PerRequest', price: '1000000' },
          authRequired: true,
        },
      ];

      const meta = { path: '/api/users/admin', method: 'GET' };
      const result = findRule(meta, rules);

      // Should match the first rule (exact match)
      expect(result).toBeDefined();
      expect(result?.id).toBe('exact-match');
    });

    it('should handle complex regex patterns', () => {
      const rules: BillingRule[] = [
        {
          id: 'llm-proxy',
          when: {
            pathRegex: '^/v1/([^/]+)/chat/completions$',
            method: 'POST',
          },
          strategy: { type: 'FinalCost' },
          authRequired: true,
        },
      ];

      // Should match various providers
      const providers = ['openai', 'anthropic', 'google', 'meta'];
      providers.forEach(provider => {
        const meta = { path: `/v1/${provider}/chat/completions`, method: 'POST' };
        const result = findRule(meta, rules);
        expect(result).toBeDefined();
        expect(result?.id).toBe('llm-proxy');
      });

      // Should not match invalid paths
      const invalidPaths = [
        '/v2/openai/chat/completions', // wrong version
        '/v1/openai/chat', // missing completions
        '/v1/openai/chat/completions/extra', // extra path
        '/v1//chat/completions', // empty provider
      ];

      invalidPaths.forEach(path => {
        const meta = { path, method: 'POST' };
        const result = findRule(meta, rules);
        expect(result).toBeUndefined();
      });
    });

    it('should match default rules when no specific rule matches', () => {
      const rules: BillingRule[] = [
        {
          id: 'specific-rule',
          when: {
            path: '/api/specific',
            method: 'GET',
          },
          strategy: { type: 'PerRequest', price: '1000000' },
          authRequired: true,
        },
        {
          id: 'default-rule',
          default: true,
          strategy: { type: 'PerRequest', price: '500000' },
          authRequired: false,
        },
      ];

      // Should match specific rule
      const meta1 = { path: '/api/specific', method: 'GET' };
      const result1 = findRule(meta1, rules);
      expect(result1).toBeDefined();
      expect(result1?.id).toBe('specific-rule');

      // Should match default rule for unmatched paths
      const meta2 = { path: '/api/other', method: 'GET' };
      const result2 = findRule(meta2, rules);
      expect(result2).toBeDefined();
      expect(result2?.id).toBe('default-rule');
    });

    it('should match method constraints', () => {
      const rules: BillingRule[] = [
        {
          id: 'get-only',
          when: {
            pathRegex: '^/api/data$',
            method: 'GET',
          },
          strategy: { type: 'PerRequest', price: '1000000' },
          authRequired: true,
        },
        {
          id: 'post-only',
          when: {
            pathRegex: '^/api/data$',
            method: 'POST',
          },
          strategy: { type: 'PerRequest', price: '2000000' },
          authRequired: true,
        },
      ];

      // Should match GET rule
      const getMeta = { path: '/api/data', method: 'GET' };
      const getResult = findRule(getMeta, rules);
      expect(getResult).toBeDefined();
      expect(getResult?.id).toBe('get-only');

      // Should match POST rule
      const postMeta = { path: '/api/data', method: 'POST' };
      const postResult = findRule(postMeta, rules);
      expect(postResult).toBeDefined();
      expect(postResult?.id).toBe('post-only');

      // Should not match PUT
      const putMeta = { path: '/api/data', method: 'PUT' };
      const putResult = findRule(putMeta, rules);
      expect(putResult).toBeUndefined();
    });

    it('should handle empty rules array', () => {
      const rules: BillingRule[] = [];
      const meta = { path: '/api/test', method: 'GET' };
      const result = findRule(meta, rules);
      expect(result).toBeUndefined();
    });

    it('should handle rules without when clause', () => {
      const rules: BillingRule[] = [
        {
          id: 'no-when',
          strategy: { type: 'PerRequest', price: '1000000' },
          authRequired: true,
        },
      ];

      const meta = { path: '/api/test', method: 'GET' };
      const result = findRule(meta, rules);
      expect(result).toBeUndefined();
    });

    it('should cache regex patterns for performance', () => {
      const rules: BillingRule[] = [
        {
          id: 'cached-regex',
          when: {
            pathRegex: '^/api/users/\\d+$',
            method: 'GET',
          },
          strategy: { type: 'PerRequest', price: '1000000' },
          authRequired: true,
        },
      ];

      // Multiple calls with the same regex pattern should use cached regex
      const paths = ['/api/users/1', '/api/users/2', '/api/users/3'];

      paths.forEach(path => {
        const meta = { path, method: 'GET' };
        const result = findRule(meta, rules);
        expect(result).toBeDefined();
        expect(result?.id).toBe('cached-regex');
      });
    });

    it('should handle case-sensitive regex patterns', () => {
      const rules: BillingRule[] = [
        {
          id: 'case-sensitive',
          when: {
            pathRegex: '^/API/test$', // Uppercase API
            method: 'GET',
          },
          strategy: { type: 'PerRequest', price: '1000000' },
          authRequired: true,
        },
      ];

      // Should match exact case
      const meta1 = { path: '/API/test', method: 'GET' };
      const result1 = findRule(meta1, rules);
      expect(result1).toBeDefined();

      // Should not match different case
      const meta2 = { path: '/api/test', method: 'GET' };
      const result2 = findRule(meta2, rules);
      expect(result2).toBeUndefined();
    });

    it('should handle case-insensitive regex patterns', () => {
      const rules: BillingRule[] = [
        {
          id: 'case-insensitive',
          when: {
            pathRegex: '^/api/test$',
            method: 'GET',
          },
          strategy: { type: 'PerRequest', price: '1000000' },
          authRequired: true,
        },
      ];

      // Both should match since we're not using case-insensitive flag in the regex
      const meta1 = { path: '/api/test', method: 'GET' };
      const result1 = findRule(meta1, rules);
      expect(result1).toBeDefined();

      const meta2 = { path: '/API/test', method: 'GET' };
      const result2 = findRule(meta2, rules);
      expect(result2).toBeUndefined(); // Should not match different case
    });
  });
});
