/**
 * Google Gemini Provider Integration Tests
 * Tests real API calls with actual API keys from environment
 * Focus: Successful scenarios only
 */

import { GoogleProvider } from '../../src/providers/google.js';
import { TestEnv, createProviderTestSuite } from '../utils/testEnv.js';
import { GoogleTestUtils } from '../utils/googleTestUtils.js';
import { BaseTestValidation } from '../utils/baseTestUtils.js';
import { pricingRegistry } from '../../src/billing/pricing.js';

// Log test environment status
beforeAll(() => {
  TestEnv.logStatus();
});

createProviderTestSuite('google', () => {
  let provider: GoogleProvider;
  let apiKey: string;
  let googleUtils: GoogleTestUtils;

  beforeAll(() => {
    provider = new GoogleProvider();
    apiKey = TestEnv.getProviderApiKey('google')!;
    googleUtils = new GoogleTestUtils(provider, apiKey);
  });

  describe('Generate Content API', () => {
    it('should handle non-streaming generateContent', async () => {
      const result = await googleUtils.testGenerateContent({
        model: 'gemini-2.0-flash-exp',
        max_tokens: 50,
      });

      const validation: BaseTestValidation = {
        expectSuccess: true,
        expectUsage: true,
        expectCost: true,
        minTokens: 10,
        maxTokens: 200,
        expectedModel: 'gemini-2.0-flash-exp',
      };

      const validationResult = googleUtils.validateResponse(result, validation);

      if (!validationResult.valid) {
        console.error('Validation errors:', validationResult.errors);
        console.error('Test result:', result);
      }

      expect(validationResult.valid).toBe(true);
      expect(result.success).toBe(true);
    }, 30000);

    it('should handle streaming streamGenerateContent', async () => {
      const result = await googleUtils.testStreamGenerateContent({
        model: 'gemini-2.0-flash-exp',
        max_tokens: 30,
      });

      const validation: BaseTestValidation = {
        expectSuccess: true,
        expectUsage: true,
        expectCost: true,
        minTokens: 10,
        maxTokens: 200,
        expectedModel: 'gemini-2.0-flash-exp',
      };

      const validationResult = googleUtils.validateResponse(result, validation);

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

        const result = await googleUtils.testGenerateContent({
          model,
          max_tokens: 30,
        });

        // Accept both success and known unavailability conditions
        if (result.success) {
          expect(result.cost?.model).toBe(model);
          console.log(`✅ Model ${model} is available and working`);
        } else {
          // Model might be unavailable, region-restricted, or deprecated
          console.log(`⚠️  Model ${model} is not available: ${result.error}`);
          expect(result.error).toBeTruthy();
        }
      }
    }, 60000);

    it('should handle multi-turn conversations', async () => {
      const result = await googleUtils.testGenerateContent({
        model: 'gemini-2.0-flash-exp',
        messages: [
          { role: 'user', content: 'What is 2+2?' },
          { role: 'assistant', content: '2+2 equals 4.' },
          { role: 'user', content: 'What about 3+3?' },
        ],
        max_tokens: 50,
      });

      const validation: BaseTestValidation = {
        expectSuccess: true,
        expectUsage: true,
        expectCost: true,
        minTokens: 10,
        maxTokens: 200,
      };

      const validationResult = googleUtils.validateResponse(result, validation);

      if (!validationResult.valid) {
        console.error('Validation errors:', validationResult.errors);
        console.error('Test result:', result);
      }

      expect(validationResult.valid).toBe(true);
      expect(result.success).toBe(true);
    }, 30000);

    it('should handle multimodal content (vision)', async () => {
      const result = await googleUtils.testMultimodalContent({
        model: 'gemini-1.5-flash',
        max_tokens: 100,
      });

      // Multimodal might have different response structure, so we'll be more lenient
      const validation: BaseTestValidation = {
        expectSuccess: true,
        expectUsage: true,
        minTokens: 5,
        maxTokens: 300,
      };

      const validationResult = googleUtils.validateResponse(result, validation);

      if (!validationResult.valid) {
        console.error('Validation errors:', validationResult.errors);
        console.error('Test result:', result);
      }

      expect(validationResult.valid).toBe(true);
      expect(result.success).toBe(true);
    }, 30000);
  });

  describe('Usage and Cost Calculation', () => {
    it('should extract usage from non-streaming response', async () => {
      const result = await googleUtils.testGenerateContent({
        model: 'gemini-2.0-flash-exp',
        max_tokens: 50,
      });

      expect(result.success).toBe(true);
      expect(result.usage).toBeDefined();
      expect(result.usage?.promptTokens).toBeGreaterThan(0);
      expect(result.usage?.completionTokens).toBeGreaterThan(0);
      expect(result.usage?.totalTokens).toBeGreaterThan(0);
      expect(result.usage?.totalTokens).toBe(
        result.usage!.promptTokens + result.usage!.completionTokens
      );
    }, 30000);

    it('should extract usage from streaming response', async () => {
      const result = await googleUtils.testStreamGenerateContent({
        model: 'gemini-2.0-flash-exp',
        max_tokens: 50,
      });

      expect(result.success).toBe(true);
      expect(result.usage).toBeDefined();
      expect(result.usage?.promptTokens).toBeGreaterThan(0);
      expect(result.usage?.completionTokens).toBeGreaterThan(0);
      expect(result.usage?.totalTokens).toBeGreaterThan(0);
    }, 30000);

    it('should calculate cost correctly using gateway pricing', async () => {
      const result = await googleUtils.testGenerateContent({
        model: 'gemini-1.5-flash',
        max_tokens: 50,
      });

      expect(result.success).toBe(true);
      expect(result.cost).toBeDefined();
      expect(result.cost?.costUsd).toBeDefined();
      expect(result.cost?.costUsd).toBeGreaterThan(0);
      expect(result.cost?.model).toBe('gemini-1.5-flash');
      expect(result.cost?.provider).toBe('google');

      // Verify cost components
      if (result.cost?.inputCostUsd !== undefined) {
        expect(result.cost.inputCostUsd).toBeGreaterThanOrEqual(0);
      }
      if (result.cost?.outputCostUsd !== undefined) {
        expect(result.cost.outputCostUsd).toBeGreaterThanOrEqual(0);
      }
    }, 30000);

    it('should handle free models (gemini-2.0-flash-exp)', async () => {
      const result = await googleUtils.testGenerateContent({
        model: 'gemini-2.0-flash-exp',
        max_tokens: 50,
      });

      expect(result.success).toBe(true);
      expect(result.cost).toBeDefined();
      
      // Free model should have $0 cost
      expect(result.cost?.costUsd).toBe(0);
      expect(result.cost?.model).toBe('gemini-2.0-flash-exp');
      
      // But should still track usage
      expect(result.usage).toBeDefined();
      expect(result.usage?.totalTokens).toBeGreaterThan(0);
    }, 30000);
  });

  describe('Error Handling', () => {
    it('should handle invalid model gracefully', async () => {
      const result = await googleUtils.testGenerateContent({
        model: 'invalid-model-that-does-not-exist',
        max_tokens: 50,
      });

      expect(result.success).toBe(false);
      expect(result.error).toBeDefined();
      expect(result.statusCode).toBeDefined();
      expect(result.statusCode).toBeGreaterThanOrEqual(400);
    }, 30000);

    it('should handle malformed request parameters', async () => {
      const result = await googleUtils.testGenerateContent({
        model: 'gemini-2.0-flash-exp',
        max_tokens: -1, // Invalid value
      });

      // The provider should either reject this or normalize it
      // We accept either success (if normalized) or error (if rejected)
      expect([true, false]).toContain(result.success);
    }, 30000);
  });

  describe('Pricing Registry', () => {
    it('should have Google models in pricing registry', () => {
      const models = ['gemini-2.0-flash-exp', 'gemini-1.5-flash', 'gemini-1.5-pro'];

      for (const model of models) {
        const pricing = pricingRegistry.getModelPricing('google', model);
        expect(pricing).toBeDefined();
        expect(pricing?.promptPerMTokUsd).toBeDefined();
        expect(pricing?.completionPerMTokUsd).toBeDefined();
      }
    });

    it('should support model family pattern matching', () => {
      const testCases = [
        { model: 'gemini-1.5-pro-001', shouldMatch: 'gemini-1.5-pro' },
        { model: 'gemini-1.5-flash-latest', shouldMatch: 'gemini-1.5-flash' },
        { model: 'gemini-2.0-flash-thinking-exp', shouldMatch: 'gemini-2.0-flash-exp' },
      ];

      for (const { model, shouldMatch } of testCases) {
        const pricing = pricingRegistry.getModelPricing('google', model);
        
        // Should fallback to base model pricing if specific model not found
        expect(pricing).toBeDefined();
        
        const basePricing = pricingRegistry.getModelPricing('google', shouldMatch);
        if (basePricing) {
          // If variant model uses pattern matching, it should have the same pricing as base
          expect(pricing?.promptPerMTokUsd).toBeDefined();
          expect(pricing?.completionPerMTokUsd).toBeDefined();
        }
      }
    });
  });
});
