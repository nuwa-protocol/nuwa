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

  beforeAll(() => {
    provider = new ClaudeProvider();
    apiKey = TestEnv.getProviderApiKey('claude')!;
  });

  describe('Messages API', () => {
    it('should handle non-streaming message completion', async () => {
      const result = await ClaudeTestUtils.testMessageCompletion(
        provider,
        apiKey,
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

      const validationResult = ClaudeTestUtils.validateTestResponse(result, validation);
      
      if (!validationResult.valid) {
        console.error('Validation errors:', validationResult.errors);
        console.error('Test result:', result);
      }

      expect(validationResult.valid).toBe(true);
      expect(result.success).toBe(true);
    }, 30000);

    it('should handle streaming message completion', async () => {
      const result = await ClaudeTestUtils.testStreamingMessageCompletion(
        provider,
        apiKey,
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

      const validationResult = ClaudeTestUtils.validateTestResponse(result, validation);
      
      if (!validationResult.valid) {
        console.error('Validation errors:', validationResult.errors);
        console.error('Test result:', result);
      }

      expect(validationResult.valid).toBe(true);
      expect(result.success).toBe(true);
    }, 30000);

    it('should handle different Claude models', async () => {
      const models = [
        'claude-3-5-haiku-20241022',
        'claude-3-haiku-20240307'
      ];

      for (const model of models) {
        const result = await ClaudeTestUtils.testMessageCompletion(
          provider,
          apiKey,
          { model }
        );

        expect(result.success).toBe(true);
        if (result.usage) {
          expect(result.usage.totalTokens).toBeGreaterThan(0);
        }
      }
    }, 60000);

    it('should handle error responses gracefully', async () => {
      // Test with invalid model
      const result = await ClaudeTestUtils.testMessageCompletion(
        provider,
        apiKey,
        { model: 'invalid-model-name' }
      );

      expect(result.success).toBe(false);
      expect(result.error).toBeDefined();
    }, 30000);

    it('should handle authentication errors', async () => {
      // Test with invalid API key
      const result = await ClaudeTestUtils.testMessageCompletion(
        provider,
        'invalid-api-key',
        { model: 'claude-3-5-haiku-20241022' }
      );

      expect(result.success).toBe(false);
      expect(result.error).toBeDefined();
    }, 30000);
  });

  describe('Usage Extraction', () => {
    it('should extract usage from non-streaming responses', async () => {
      const result = await ClaudeTestUtils.testMessageCompletion(
        provider,
        apiKey,
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
      const result = await ClaudeTestUtils.testStreamingMessageCompletion(
        provider,
        apiKey,
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
      const models = [
        { name: 'claude-3-5-haiku-20241022', expectedRate: 1.0 }, // $1.00 per 1M prompt tokens
        { name: 'claude-3-haiku-20240307', expectedRate: 0.25 }   // $0.25 per 1M prompt tokens
      ];

      for (const { name: model, expectedRate } of models) {
        const result = await ClaudeTestUtils.testMessageCompletion(
          provider,
          apiKey,
          { model }
        );

        expect(result.success).toBe(true);
        expect(result.cost).toBeDefined();
        expect(result.cost!.totalUsd).toBeGreaterThan(0);

        // Verify cost calculation is reasonable
        if (result.usage) {
          const expectedPromptCost = (result.usage.promptTokens / 1_000_000) * expectedRate;
          expect(result.cost!.promptUsd).toBeCloseTo(expectedPromptCost, 6);
        }
      }
    }, 60000);
  });

  describe('Provider-Specific Features', () => {
    it('should handle max_tokens parameter correctly', async () => {
      const result = await ClaudeTestUtils.testMessageCompletion(
        provider,
        apiKey,
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
      const result = await ClaudeTestUtils.testMessageCompletion(
        provider,
        apiKey,
        { model: 'claude-3-5-haiku-20241022' }
      );

      expect(result.success).toBe(true);
    }, 30000);
  });
});
