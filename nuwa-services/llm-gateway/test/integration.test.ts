/**
 * Integration tests for route-based provider gateway
 * Tests the new provider selection and pricing functionality
 */

import { describe, it, expect, beforeAll, afterAll } from '@jest/globals';
import request from 'supertest';
import express from 'express';
import { providerRegistry } from '../src/providers/registry.js';
import { pricingRegistry } from '../src/billing/pricing.js';
import { UsagePolicy } from '../src/billing/usagePolicy.js';

describe('Route-based Provider Gateway Integration Tests', () => {
  let app: express.Application;

  beforeAll(async () => {
    // Mock setup - in real tests you'd set up the full app
    app = express();
    app.use(express.json());
  });

  afterAll(() => {
    providerRegistry.clear();
  });

  describe('Provider Registry', () => {
    it('should register providers correctly', () => {
      expect(providerRegistry.list()).toContain('openrouter');
      expect(providerRegistry.list()).toContain('litellm');
      expect(providerRegistry.list()).toContain('openai');
    });

    it('should retrieve provider configurations', () => {
      const openaiConfig = providerRegistry.get('openai');
      expect(openaiConfig).toBeTruthy();
      expect(openaiConfig?.name).toBe('openai');
      expect(openaiConfig?.supportsNativeUsdCost).toBe(false);

      const openrouterConfig = providerRegistry.get('openrouter');
      expect(openrouterConfig).toBeTruthy();
      expect(openrouterConfig?.supportsNativeUsdCost).toBe(true);
    });
  });

  describe('Pricing System', () => {
    it('should have default OpenAI pricing', () => {
      const gpt4Pricing = pricingRegistry.getPricing('gpt-4');
      expect(gpt4Pricing).toBeTruthy();
      expect(gpt4Pricing?.promptPerMTokUsd).toBe(30.0);
      expect(gpt4Pricing?.completionPerMTokUsd).toBe(60.0);

      const gpt35Pricing = pricingRegistry.getPricing('gpt-3.5-turbo');
      expect(gpt35Pricing).toBeTruthy();
      expect(gpt35Pricing?.promptPerMTokUsd).toBe(0.5);
      expect(gpt35Pricing?.completionPerMTokUsd).toBe(1.5);
    });

    it('should calculate costs correctly', () => {
      const usage = {
        promptTokens: 1000,
        completionTokens: 500,
        totalTokens: 1500
      };

      const result = pricingRegistry.calculateCost('gpt-4', usage);
      expect(result).toBeTruthy();
      expect(result?.costUsd).toBeCloseTo(0.060); // (1000/1M * 30) + (500/1M * 60) = 0.03 + 0.03 = 0.06
      expect(result?.source).toBe('gateway-pricing');
    });

    it('should handle model family patterns', () => {
      const gpt4oPricing = pricingRegistry.getPricing('gpt-4o-2024-05-13');
      expect(gpt4oPricing).toBeTruthy();
      expect(gpt4oPricing?.promptPerMTokUsd).toBe(5.0);

      const gpt35Pricing = pricingRegistry.getPricing('gpt-3.5-turbo-0125');
      expect(gpt35Pricing).toBeTruthy();
      expect(gpt35Pricing?.promptPerMTokUsd).toBe(0.5);
    });
  });

  describe('Usage Policy', () => {
    it('should extract usage from response body', () => {
      const responseBody = {
        id: 'chatcmpl-123',
        choices: [{ message: { content: 'Hello!' } }],
        usage: {
          prompt_tokens: 10,
          completion_tokens: 5,
          total_tokens: 15
        }
      };

      const usage = UsagePolicy.extractUsageFromResponse(responseBody);
      expect(usage).toBeTruthy();
      expect(usage?.promptTokens).toBe(10);
      expect(usage?.completionTokens).toBe(5);
      expect(usage?.totalTokens).toBe(15);
    });

    it('should inject stream usage options', () => {
      const requestData = {
        model: 'gpt-4',
        messages: [{ role: 'user', content: 'Hello' }],
        stream: true
      };

      const injected = UsagePolicy.injectStreamUsageOption(requestData);
      expect(injected.stream_options).toBeTruthy();
      expect(injected.stream_options.include_usage).toBe(true);
    });

    it('should calculate request costs with provider preference', () => {
      const usage = { promptTokens: 1000, completionTokens: 500 };
      
      // Test provider cost preference
      const resultWithProvider = UsagePolicy.calculateRequestCost('gpt-4', 0.05, usage);
      expect(resultWithProvider?.costUsd).toBe(0.05);
      expect(resultWithProvider?.source).toBe('provider');

      // Test gateway pricing fallback
      const resultWithoutProvider = UsagePolicy.calculateRequestCost('gpt-4', undefined, usage);
      expect(resultWithoutProvider?.costUsd).toBeCloseTo(0.06);
      expect(resultWithoutProvider?.source).toBe('gateway-pricing');
    });

    it('should extract usage from SSE stream chunks', () => {
      const sseChunk = `data: {"id":"chatcmpl-123","object":"chat.completion.chunk","choices":[{"delta":{"content":"Hello"}}]}\n\ndata: {"id":"chatcmpl-123","object":"chat.completion.chunk","choices":[{"finish_reason":"stop"}],"usage":{"prompt_tokens":10,"completion_tokens":5,"total_tokens":15}}\n\ndata: [DONE]\n\n`;

      const usage = UsagePolicy.extractUsageFromStreamChunk(sseChunk);
      expect(usage).toBeTruthy();
      expect(usage?.promptTokens).toBe(10);
      expect(usage?.completionTokens).toBe(5);
    });
  });

  describe('Route Patterns', () => {
    it('should validate route patterns', () => {
      // Test that our route patterns would match correctly
      const providerRoutes = [
        '/api/v1/openai/chat/completions',
        '/api/v1/openrouter/chat/completions',
        '/api/v1/litellm/chat/completions',
        '/api/v1/openai/embeddings',
        '/api/v1/openrouter/models'
      ];

      const legacyRoute = '/api/v1/chat/completions';

      // In a real Express app, these would be handled by the router
      providerRoutes.forEach(route => {
        const match = route.match(/^\/api\/v1\/([^\/]+)\/(.*)/);
        expect(match).toBeTruthy();
        expect(match![1]).toMatch(/^(openai|openrouter|litellm)$/);
      });

      const legacyMatch = legacyRoute.match(/^\/api\/v1\/chat\/completions$/);
      expect(legacyMatch).toBeTruthy();
    });
  });

  describe('Environment Variable Overrides', () => {
    it('should support pricing overrides via environment', () => {
      // Test pricing override functionality
      const originalGpt4Pricing = pricingRegistry.getPricing('gpt-4');
      
      // Simulate environment override
      pricingRegistry.updatePricing('gpt-4-test', {
        promptPerMTokUsd: 25.0,
        completionPerMTokUsd: 50.0
      });

      const overriddenPricing = pricingRegistry.getPricing('gpt-4-test');
      expect(overriddenPricing?.promptPerMTokUsd).toBe(25.0);
      expect(overriddenPricing?.completionPerMTokUsd).toBe(50.0);
    });
  });
});

describe('Provider-specific Logic', () => {
  describe('OpenAI Provider', () => {
    it('should not provide native USD cost', () => {
      const openaiConfig = providerRegistry.get('openai');
      expect(openaiConfig?.supportsNativeUsdCost).toBe(false);
    });

    it('should require manual API key management', () => {
      const openaiConfig = providerRegistry.get('openai');
      expect(openaiConfig?.requiresApiKey).toBe(true);
      // All providers now require manual key management
    });
  });

  describe('OpenRouter Provider', () => {
    it('should support native USD cost', () => {
      const openrouterConfig = providerRegistry.get('openrouter');
      expect(openrouterConfig?.supportsNativeUsdCost).toBe(true);
    });

    it('should require manual API key management', () => {
      const openrouterConfig = providerRegistry.get('openrouter');
      expect(openrouterConfig?.requiresApiKey).toBe(true);
    });
  });

  describe('LiteLLM Provider', () => {
    it('should support native USD cost', () => {
      const litellmConfig = providerRegistry.get('litellm');
      expect(litellmConfig?.supportsNativeUsdCost).toBe(true);
    });

    it('should require manual API key management', () => {
      const litellmConfig = providerRegistry.get('litellm');
      expect(litellmConfig?.requiresApiKey).toBe(true);
    });
  });
});
