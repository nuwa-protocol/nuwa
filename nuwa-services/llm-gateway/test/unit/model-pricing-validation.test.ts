import { PricingRegistry } from '../../src/billing/pricing.js';
import { RouteHandler } from '../../src/core/routeHandler.js';
import { ProviderManager } from '../../src/core/providerManager.js';
import { AuthManager } from '../../src/core/authManager.js';
import { Request, Response } from 'express';

describe('Model Pricing Validation', () => {
  let pricingRegistry: PricingRegistry;

  beforeEach(() => {
    // Get singleton instance
    pricingRegistry = PricingRegistry.getInstance();
    // Reload config to ensure clean state
    pricingRegistry.reload();
  });

  describe('PricingRegistry.isModelSupported', () => {
    it('should return true for providers with native USD cost', () => {
      // OpenRouter supports native USD cost
      const result = pricingRegistry.isModelSupported(
        'openrouter',
        'any-model-name',
        true
      );
      expect(result).toBe(true);

      // LiteLLM also supports native USD cost
      const result2 = pricingRegistry.isModelSupported(
        'litellm',
        'another-model',
        true
      );
      expect(result2).toBe(true);
    });

    it('should return true for configured OpenAI models', () => {
      // Test with known OpenAI models
      const gpt4Result = pricingRegistry.isModelSupported(
        'openai',
        'gpt-4',
        false
      );
      expect(gpt4Result).toBe(true);

      const gpt35Result = pricingRegistry.isModelSupported(
        'openai',
        'gpt-3.5-turbo',
        false
      );
      expect(gpt35Result).toBe(true);
    });

    it('should return true for configured Claude models', () => {
      // Test with known Claude models
      const claudeResult = pricingRegistry.isModelSupported(
        'claude',
        'claude-3-5-sonnet-20241022',
        false
      );
      expect(claudeResult).toBe(true);

      const claude3Result = pricingRegistry.isModelSupported(
        'claude',
        'claude-3-opus-20240229',
        false
      );
      expect(claude3Result).toBe(true);
    });

    it('should return false for unconfigured models without native USD cost', () => {
      // Test with non-existent model for OpenAI
      const result = pricingRegistry.isModelSupported(
        'openai',
        'unknown-model-xyz',
        false
      );
      expect(result).toBe(false);

      // Test with non-existent model for Claude
      const claudeResult = pricingRegistry.isModelSupported(
        'claude',
        'fake-claude-model',
        false
      );
      expect(claudeResult).toBe(false);
    });

    it('should handle empty model name', () => {
      const result = pricingRegistry.isModelSupported(
        'openai',
        '',
        false
      );
      // Empty model name won't be found in pricing config
      expect(result).toBe(false);
    });
  });

  describe('RouteHandler validation', () => {
    let routeHandler: RouteHandler;
    let providerManager: ProviderManager;
    let authManager: AuthManager;

    beforeEach(() => {
      // Create test instances with skipAuth enabled
      providerManager = ProviderManager.getInstance();
      authManager = AuthManager.createTestInstance();
      
      routeHandler = new RouteHandler({
        providerManager,
        authManager,
        skipAuth: true
      });
    });

    it('should reject unconfigured models with 400 for non-native-cost providers', async () => {
      // Mock request with unconfigured model
      const req = {
        body: {
          model: 'unknown-model-xyz',
          messages: [{ role: 'user', content: 'test' }]
        },
        method: 'POST',
        path: '/v1/chat/completions'
      } as Request;

      const res = {
        status: jest.fn().mockReturnThis(),
        json: jest.fn(),
        setHeader: jest.fn(),
        locals: {} // Initialize locals property
      } as unknown as Response;

      // Initialize providers
      providerManager.initializeProviders();

      // Test with OpenAI (doesn't support native USD cost)
      if (providerManager.has('openai')) {
        await routeHandler.handleProviderRequest(req, res, 'openai');
        
        // Should return 400 error
        expect(res.status).toHaveBeenCalledWith(400);
        expect(res.json).toHaveBeenCalledWith(
          expect.objectContaining({
            error: expect.objectContaining({
              message: expect.stringContaining('not supported'),
              type: 'invalid_request_error',
              code: 'model_not_supported'
            })
          })
        );
      }
    });

    it('should allow native USD cost providers without pricing config', async () => {
      // Mock request with any model name
      const req = {
        body: {
          model: 'any-random-model',
          messages: [{ role: 'user', content: 'test' }]
        },
        method: 'POST',
        path: '/api/v1/chat/completions',
        headers: {}
      } as Request;

      const res = {
        status: jest.fn().mockReturnThis(),
        json: jest.fn(),
        setHeader: jest.fn(),
        locals: {}
      } as unknown as Response;

      // Initialize providers
      providerManager.initializeProviders();

      // Test with OpenRouter (supports native USD cost)
      // This should NOT be rejected due to missing pricing config
      // Note: The actual request will fail due to missing API key or network,
      // but it should NOT fail at the pricing validation stage
      
      // We can't easily test the full flow without mocking network calls,
      // but we can verify the pricing validation logic directly
      const providerConfig = providerManager.get('openrouter');
      if (providerConfig) {
        const isSupported = pricingRegistry.isModelSupported(
          'openrouter',
          'any-random-model',
          providerConfig.supportsNativeUsdCost
        );
        expect(isSupported).toBe(true);
      }
    });

    it('should reject requests without model field', async () => {
      // Mock request without model field
      const req = {
        body: {
          messages: [{ role: 'user', content: 'test' }]
        },
        method: 'POST',
        path: '/v1/chat/completions'
      } as Request;

      const res = {
        status: jest.fn().mockReturnThis(),
        json: jest.fn(),
        setHeader: jest.fn(),
        locals: {} // Initialize locals property
      } as unknown as Response;

      // Initialize providers
      providerManager.initializeProviders();

      // Test with OpenAI
      if (providerManager.has('openai')) {
        await routeHandler.handleProviderRequest(req, res, 'openai');
        
        // Should return 400 error
        expect(res.status).toHaveBeenCalledWith(400);
        expect(res.json).toHaveBeenCalledWith(
          expect.objectContaining({
            error: expect.objectContaining({
              message: expect.stringContaining('Model not specified'),
              type: 'invalid_request_error',
              code: 'model_not_supported'
            })
          })
        );
      }
    });

    it('should allow streaming requests for configured models', async () => {
      // Mock streaming request with configured model
      const req = {
        body: {
          model: 'gpt-3.5-turbo',
          messages: [{ role: 'user', content: 'test' }],
          stream: true
        },
        method: 'POST',
        path: '/v1/chat/completions'
      } as Request;

      const res = {
        status: jest.fn().mockReturnThis(),
        json: jest.fn(),
        setHeader: jest.fn(),
        write: jest.fn(),
        end: jest.fn(),
        on: jest.fn(),
        locals: {}
      } as unknown as Response;

      // Initialize providers
      providerManager.initializeProviders();

      // The request will fail at network level, but should pass pricing validation
      // We verify this by checking that 400 with model_not_supported is NOT called
      if (providerManager.has('openai')) {
        await routeHandler.handleProviderRequest(req, res, 'openai');
        
        // If pricing validation failed, status would be called with 400
        // and json would be called with model_not_supported error
        // Since we're testing with a valid model, this should not happen
        if ((res.status as jest.Mock).mock.calls.length > 0) {
          const statusCode = (res.status as jest.Mock).mock.calls[0][0];
          if (statusCode === 400 && (res.json as jest.Mock).mock.calls.length > 0) {
            const errorBody = (res.json as jest.Mock).mock.calls[0][0];
            // Should not be a pricing validation error
            expect(errorBody.error?.code).not.toBe('model_not_supported');
          }
        }
      }
    });
  });
});

