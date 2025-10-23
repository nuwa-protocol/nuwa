/**
 * Claude Provider Integration Tests
 * Tests real API calls with actual API keys from environment
 */

import { ClaudeProvider } from '../../src/providers/claude.js';
import { TestEnv, createProviderTestSuite } from '../utils/testEnv.js';
import { ClaudeTestUtils } from '../utils/claudeTestUtils.js';
import { BaseTestValidation } from '../utils/baseTestUtils.js';

// Log test environment status
beforeAll(() => {
  TestEnv.logStatus();
});

createProviderTestSuite('claude', () => {
  let provider: ClaudeProvider;
  let apiKey: string;
  let claudeUtils: ClaudeTestUtils;

  beforeAll(() => {
    provider = new ClaudeProvider();
    apiKey = TestEnv.getProviderApiKey('claude')!;
    claudeUtils = new ClaudeTestUtils(provider, apiKey);
  });

  describe('Messages API', () => {
    it('should handle non-streaming message completion', async () => {
      const result = await claudeUtils.testMessageCompletion(
        { model: 'claude-3-5-haiku-20241022' }
      );

      const validation: BaseTestValidation = {
        expectSuccess: true,
        expectUsage: true,
        expectCost: true,
        minTokens: 10,
        maxTokens: 200,
        expectedModel: 'claude-3-5-haiku-20241022',
      };

      const validationResult = claudeUtils.validateResponse(result, validation);
      
      if (!validationResult.valid) {
        console.error('Validation errors:', validationResult.errors);
        console.error('Test result:', result);
      }

      expect(validationResult.valid).toBe(true);
      expect(result.success).toBe(true);
    }, 30000);

    it('should handle streaming message completion', async () => {
      const result = await claudeUtils.testStreamingMessageCompletion(
        { model: 'claude-3-5-haiku-20241022' }
      );

      const validation: BaseTestValidation = {
        expectSuccess: true,
        expectUsage: true,
        expectCost: true,
        minTokens: 10,
        maxTokens: 200,
        expectedModel: 'claude-3-5-haiku-20241022',
      };

      const validationResult = claudeUtils.validateResponse(result, validation);
      
      if (!validationResult.valid) {
        console.error('Validation errors:', validationResult.errors);
        console.error('Test result:', result);
      }

      expect(validationResult.valid).toBe(true);
      expect(result.success).toBe(true);
    }, 30000);

    it('should handle error responses gracefully', async () => {
      // Test with invalid model
      const result = await claudeUtils.testMessageCompletion(
        { model: 'invalid-model-name' }
      );

      expect(result.success).toBe(false);
      expect(result.error).toBeDefined();
    }, 30000);

    it('should handle authentication errors', async () => {
      // Test with invalid API key - create temporary instance with invalid key
      const invalidUtils = new ClaudeTestUtils(provider, 'invalid-api-key');
      const result = await invalidUtils.testMessageCompletion({
        model: 'claude-3-5-haiku-20241022'
      });

      expect(result.success).toBe(false);
      expect(result.error).toBeDefined();
    }, 30000);
  });

  describe('Usage Extraction', () => {
    it('should extract usage from non-streaming responses', async () => {
      const result = await claudeUtils.testMessageCompletion(
        { model: 'claude-3-5-haiku-20241022' }
      );

      expect(result.success).toBe(true);
      expect(result.usage).toBeDefined();
      expect(result.usage!.promptTokens).toBeGreaterThan(0);
      expect(result.usage!.completionTokens).toBeGreaterThan(0);
      expect(result.usage!.totalTokens).toBe(
        result.usage!.promptTokens + result.usage!.completionTokens
      );
    }, 30000);

    it('should extract usage from streaming responses', async () => {
      const result = await claudeUtils.testStreamingMessageCompletion(
        { model: 'claude-3-5-haiku-20241022' }
      );

      expect(result.success).toBe(true);
      expect(result.usage).toBeDefined();
      expect(result.usage!.promptTokens).toBeGreaterThan(0);
      expect(result.usage!.completionTokens).toBeGreaterThan(0);
      expect(result.usage!.totalTokens).toBe(
        result.usage!.promptTokens + result.usage!.completionTokens
      );
    }, 30000);
  });

  describe('Cost Calculation', () => {
    it('should calculate costs correctly for different models', async () => {
      // Only test available model due to API credit limitations
      const model = 'claude-3-5-haiku-20241022';
      const expectedRate = 1.0; // $1.00 per 1M prompt tokens
      const expectedCompletionRate = 5.0; // $5.00 per 1M completion tokens

      const result = await claudeUtils.testMessageCompletion(
        { model }
      );

      expect(result.success).toBe(true);
      expect(result.cost).toBeDefined();
      expect(result.cost!.costUsd).toBeGreaterThan(0);

      // Verify cost calculation is reasonable
      if (result.usage) {
        const expectedPromptCost = (result.usage.promptTokens! / 1_000_000) * expectedRate;
        const expectedCompletionCost = (result.usage.completionTokens! / 1_000_000) * expectedCompletionRate;
        const expectedTotalCost = expectedPromptCost + expectedCompletionCost;
        expect(result.cost!.costUsd).toBeCloseTo(expectedTotalCost, 6);
      }
    }, 60000);
  });

  describe('Provider-Specific Features', () => {
    it('should handle max_tokens parameter correctly', async () => {
      const result = await claudeUtils.testMessageCompletion(
        { 
          model: 'claude-3-5-haiku-20241022',
          max_tokens: 50
        }
      );

      expect(result.success).toBe(true);
      if (result.usage) {
        // Claude should respect max_tokens limit
        expect(result.usage.completionTokens).toBeLessThanOrEqual(50);
      }
    }, 30000);

    it('should handle anthropic-version header correctly', async () => {
      // This is tested implicitly in all other tests
      // Claude API requires anthropic-version header
      const result = await claudeUtils.testMessageCompletion(
        { model: 'claude-3-5-haiku-20241022' }
      );

      expect(result.success).toBe(true);
    }, 30000);
  });
});
