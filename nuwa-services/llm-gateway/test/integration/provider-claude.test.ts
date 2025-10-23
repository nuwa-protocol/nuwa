/**
 * Claude Provider Integration Tests
 * Tests real API calls with actual API keys from environment
 * Focus: Successful scenarios only
 */

import { ClaudeProvider } from '../../src/providers/claude.js';
import { TestEnv, createProviderTestSuite } from '../utils/testEnv.js';
import { ClaudeTestUtils } from '../utils/claudeTestUtils.js';
import { BaseTestValidation } from '../utils/baseTestUtils.js';
import { pricingRegistry } from '../../src/billing/pricing.js';

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

  describe('Chat Completions API', () => {
    it('should handle non-streaming message completion', async () => {
      const result = await claudeUtils.testMessageCompletion(
        { model: 'claude-3-5-haiku-20241022', max_tokens: 50 }
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
        { model: 'claude-3-5-haiku-20241022', max_tokens: 30 }
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

    it('should support different models', async () => {
      const models = provider.getTestModels();
      
      for (const model of models) {
        // Add delay between requests to avoid rate limiting
        if (models.indexOf(model) > 0) {
          await new Promise(resolve => setTimeout(resolve, 1000));
        }

        const result = await claudeUtils.testMessageCompletion({ 
          model, 
          max_tokens: 30 
        });
        
        // Accept both success and known unavailability conditions
        if (result.success) {
          expect(result.cost?.model).toBe(model);
          console.log(`✅ Model ${model} is available and working`);
        } else {
          console.log(`ℹ️ Model ${model} is not available: ${result.error}`);
          expect([400, 401, 403, 404, 429]).toContain(result.statusCode || 0);
        }
      }
    }, 60000);
  });

  describe('Usage Extraction', () => {
    it('should extract usage from non-streaming responses', async () => {
      const result = await claudeUtils.testMessageCompletion(
        { model: 'claude-3-5-haiku-20241022', max_tokens: 50 }
      );

      expect(result.success).toBe(true);
      expect(result.usage).toBeDefined();
      expect(result.usage!.promptTokens).toBeGreaterThan(0);
      expect(result.usage!.completionTokens).toBeGreaterThan(0);
      expect(result.usage!.totalTokens).toBe(
        result.usage!.promptTokens! + result.usage!.completionTokens!
      );
    }, 30000);

    it('should extract usage from streaming responses', async () => {
      const result = await claudeUtils.testStreamingMessageCompletion(
        { model: 'claude-3-5-haiku-20241022', max_tokens: 50 }
      );

      expect(result.success).toBe(true);
      expect(result.usage).toBeDefined();
      expect(result.usage!.promptTokens).toBeGreaterThan(0);
      expect(result.usage!.completionTokens).toBeGreaterThan(0);
      expect(result.usage!.totalTokens).toBe(
        result.usage!.promptTokens! + result.usage!.completionTokens!
      );
    }, 30000);
  });

  describe('Cost Calculation', () => {
    it('should calculate gateway pricing fallback', async () => {
      const model = 'claude-3-5-haiku-20241022';
      const result = await claudeUtils.testMessageCompletion(
        { model, max_tokens: 50 }
      );

      expect(result.success).toBe(true);
      expect(result.cost).toBeDefined();
      expect(result.cost!.costUsd).toBeGreaterThan(0);
      expect(result.cost!.source).toBe('gateway-pricing');
      expect(result.cost!.model).toBe(model);
    }, 30000);

    it('should calculate cost accuracy for different pricing tiers', async () => {
      const testModel = 'claude-3-5-haiku-20241022';
      const result = await claudeUtils.testMessageCompletion({ 
        model: testModel, 
        max_tokens: 50 
      });
      
      expect(result.success).toBe(true);
      expect(result.cost).toBeDefined();
      expect(result.usage).toBeDefined();
      
      if (result.cost && result.usage) {
        // Get pricing from configuration
        const pricing = pricingRegistry.getProviderPricing('claude', testModel);
        expect(pricing).toBeDefined();
        
        if (pricing) {
          // Calculate expected cost based on configuration pricing
          const expectedCost = (
            (result.usage.promptTokens! * pricing.promptPerMTokUsd) +
            (result.usage.completionTokens! * pricing.completionPerMTokUsd)
          ) / 1000000; // Convert from per-million-tokens to per-token
          
          // Allow reasonable tolerance for rounding differences
          const tolerance = 0.3; // 30% tolerance
          const costDifference = Math.abs(result.cost.costUsd - expectedCost);
          const relativeError = costDifference / expectedCost;
          
          console.log(`💰 Cost comparison for ${testModel}:`);
          console.log(`   Expected: $${expectedCost.toFixed(6)}`);
          console.log(`   Actual: $${result.cost.costUsd.toFixed(6)}`);
          console.log(`   Relative error: ${(relativeError * 100).toFixed(2)}%`);
          
          expect(relativeError).toBeLessThan(tolerance);
        }
      }
    }, 30000);
  });

  describe('Request Preparation', () => {
    it('should prepare non-streaming requests correctly', async () => {
      const result = await claudeUtils.testMessageCompletion(
        { 
          model: 'claude-3-5-haiku-20241022',
          max_tokens: 50,
          temperature: 0.7
        }
      );

      expect(result.success).toBe(true);
      expect(result.cost?.model).toBe('claude-3-5-haiku-20241022');
    }, 30000);

    it('should prepare streaming requests correctly', async () => {
      const result = await claudeUtils.testStreamingMessageCompletion(
        { 
          model: 'claude-3-5-haiku-20241022',
          max_tokens: 50,
          temperature: 0.7
        }
      );

      expect(result.success).toBe(true);
      expect(result.cost?.model).toBe('claude-3-5-haiku-20241022');
    }, 30000);
  });

  describe('Provider-Specific Features', () => {
    it('should handle max_tokens parameter correctly', async () => {
      const result = await claudeUtils.testMessageCompletion(
        { 
          model: 'claude-3-5-haiku-20241022',
          max_tokens: 20
        }
      );

      expect(result.success).toBe(true);
      if (result.usage) {
        // Claude should respect max_tokens limit (with some tolerance for tokenization differences)
        expect(result.usage.completionTokens).toBeLessThanOrEqual(25);
      }
    }, 30000);

    it('should handle anthropic-version header correctly', async () => {
      // This is tested implicitly in all other tests
      // Claude API requires anthropic-version header
      const result = await claudeUtils.testMessageCompletion(
        { model: 'claude-3-5-haiku-20241022', max_tokens: 50 }
      );

      expect(result.success).toBe(true);
    }, 30000);

    it('should handle custom messages format', async () => {
      const result = await claudeUtils.testMessageCompletion({
        model: 'claude-3-5-haiku-20241022',
        max_tokens: 50,
        messages: [
          { role: 'user', content: 'What is the capital of France?' }
        ]
      });

      expect(result.success).toBe(true);
      expect(result.usage).toBeDefined();
      expect(result.cost).toBeDefined();
    }, 30000);
  });
});
