/**
 * ProviderManager Integration Tests
 * Tests the provider management system with real configurations
 */

import { ProviderManager } from '../../src/core/providerManager.js';
import { RouteHandler } from '../../src/core/routeHandler.js';
import { AuthManager } from '../../src/core/authManager.js';
import { TestEnv } from '../utils/testEnv.js';

describe('ProviderManager Integration Tests', () => {
  let providerManager: ProviderManager;

  beforeAll(() => {
    TestEnv.logStatus();
    
    // Skip entire test suite if integration tests should be skipped
    if (TestEnv.shouldSkipIntegrationTests()) {
      console.log('Skipping ProviderManager integration tests (SKIP_INTEGRATION_TESTS=true)');
    }
  });

  beforeEach(() => {
    providerManager = ProviderManager.createTestInstance();
  });

  describe('Provider Registration', () => {
    it('should register providers based on environment configuration', () => {
      // Skip this test if integration tests should be skipped
      if (TestEnv.shouldSkipIntegrationTests()) {
        console.log('Skipping environment-based provider registration test (SKIP_INTEGRATION_TESTS=true)');
        return;
      }

      const result = providerManager.initializeProviders({ skipEnvCheck: false });
      
      expect(result).toBeDefined();
      expect(result.registered).toBeDefined();
      expect(result.skipped).toBeDefined();
      expect(Array.isArray(result.registered)).toBe(true);
      expect(Array.isArray(result.skipped)).toBe(true);

      console.log('Registered providers:', result.registered);
      console.log('Skipped providers:', result.skipped);

      // Should have registered at least one provider if any API keys are configured
      const enabledProviders = TestEnv.getEnabledProviders();
      if (enabledProviders.length > 0) {
        expect(result.registered.length).toBeGreaterThan(0);
      }
    });

    it('should register all providers when skipping env check', () => {
      const result = providerManager.initializeProviders({ skipEnvCheck: true });
      
      expect(result.registered).toContain('openai');
      expect(result.registered).toContain('openrouter');
      expect(result.registered).toContain('litellm');
      expect(result.skipped.length).toBe(0);
    });

    it('should handle provider configuration correctly', () => {
      providerManager.initializeProviders({ skipEnvCheck: true });
      
      const openaiConfig = providerManager.get('openai');
      expect(openaiConfig).toBeDefined();
      expect(openaiConfig?.name).toBe('openai');
      expect(openaiConfig?.requiresApiKey).toBe(true);
      expect(openaiConfig?.supportsNativeUsdCost).toBe(false);
      expect(openaiConfig?.allowedPaths).toContain('/v1/chat/completions');

      const openrouterConfig = providerManager.get('openrouter');
      expect(openrouterConfig).toBeDefined();
      expect(openrouterConfig?.name).toBe('openrouter');
      expect(openrouterConfig?.requiresApiKey).toBe(true);
      expect(openrouterConfig?.supportsNativeUsdCost).toBe(true);
      expect(openrouterConfig?.allowedPaths).toContain('/api/v1/chat/completions');

      const litellmConfig = providerManager.get('litellm');
      expect(litellmConfig).toBeDefined();
      expect(litellmConfig?.name).toBe('litellm');
      expect(litellmConfig?.requiresApiKey).toBe(true);
      expect(litellmConfig?.supportsNativeUsdCost).toBe(true);
      expect(litellmConfig?.allowedPaths).toContain('/chat/completions');
    });
  });

  describe('Provider Access', () => {
    beforeEach(() => {
      providerManager.initializeProviders({ skipEnvCheck: true });
    });

    it('should list all registered providers', () => {
      const providers = providerManager.list();
      
      expect(providers).toContain('openai');
      expect(providers).toContain('openrouter');
      expect(providers).toContain('litellm');
    });

    it('should check provider existence', () => {
      expect(providerManager.has('openai')).toBe(true);
      expect(providerManager.has('openrouter')).toBe(true);
      expect(providerManager.has('litellm')).toBe(true);
      expect(providerManager.has('nonexistent')).toBe(false);
    });

    it('should get provider instances', () => {
      const openaiProvider = providerManager.getProvider('openai');
      expect(openaiProvider).toBeDefined();
      expect(typeof openaiProvider?.forwardRequest).toBe('function');

      const openrouterProvider = providerManager.getProvider('openrouter');
      expect(openrouterProvider).toBeDefined();
      expect(typeof openrouterProvider?.forwardRequest).toBe('function');

      const litellmProvider = providerManager.getProvider('litellm');
      expect(litellmProvider).toBeDefined();
      expect(typeof litellmProvider?.forwardRequest).toBe('function');

      const nonexistentProvider = providerManager.getProvider('nonexistent');
      expect(nonexistentProvider).toBe(null);
    });

    it('should handle API key retrieval', () => {
      // With skipEnvCheck, API keys won't be set
      expect(() => providerManager.getProviderApiKey('openai')).toThrow();
      expect(() => providerManager.getProviderApiKey('nonexistent')).toThrow();
    });
  });

  describe('Provider Management', () => {
    it('should allow unregistering providers', () => {
      providerManager.initializeProviders({ skipEnvCheck: true });
      
      expect(providerManager.has('openai')).toBe(true);
      
      const unregistered = providerManager.unregister('openai');
      expect(unregistered).toBe(true);
      expect(providerManager.has('openai')).toBe(false);
      
      const unregisteredAgain = providerManager.unregister('openai');
      expect(unregisteredAgain).toBe(false);
    });

    it('should allow clearing all providers', () => {
      providerManager.initializeProviders({ skipEnvCheck: true });
      
      expect(providerManager.list().length).toBeGreaterThan(0);
      
      providerManager.clear();
      expect(providerManager.list().length).toBe(0);
    });

    it('should allow getting all configurations', () => {
      providerManager.initializeProviders({ skipEnvCheck: true });
      
      const configs = providerManager.getAllConfigs();
      expect(configs.length).toBeGreaterThan(0);
      
      const providerNames = configs.map(c => c.name);
      expect(providerNames).toContain('openai');
      expect(providerNames).toContain('openrouter');
      expect(providerNames).toContain('litellm');
    });
  });

  describe('Integration with RouteHandler', () => {
    it('should work with RouteHandler for testing', () => {
      const authManager = AuthManager.createTestInstance();
      const routeHandler = new RouteHandler({
        providerManager,
        authManager,
        skipAuth: true,
      });

      expect(routeHandler).toBeDefined();
      
      // Initialize providers
      providerManager.initializeProviders({ skipEnvCheck: true });
      
      // Test that RouteHandler can access providers
      const openaiProvider = providerManager.getProvider('openai');
      expect(openaiProvider).toBeDefined();
    });

    it('should handle mock requests correctly', async () => {
      if (TestEnv.shouldSkipIntegrationTests()) {
        console.log('Skipping mock request test (SKIP_INTEGRATION_TESTS=true)');
        return;
      }

      const authManager = AuthManager.createTestInstance();
      const routeHandler = RouteHandler.createTestInstance({
        providerManager,
        authManager,
        skipAuth: true,
      });

      providerManager.initializeProviders({ skipEnvCheck: true });

      // Create mock request and response objects
      const mockReq = {
        body: {
          model: 'gpt-3.5-turbo',
          messages: [{ role: 'user', content: 'Hello' }],
        },
        path: '/openai/v1/chat/completions',
        method: 'POST',
        headers: {},
      } as any;

      const mockRes = {
        status: jest.fn().mockReturnThis(),
        json: jest.fn().mockReturnThis(),
        send: jest.fn().mockReturnThis(),
        setHeader: jest.fn().mockReturnThis(),
      } as any;

      // This will fail because we don't have real API keys, but it should handle the request structure
      await routeHandler.handleProviderRequest(mockReq, mockRes, 'openai');

      // Should have attempted to make the request
      expect(mockRes.status).toHaveBeenCalled();
    });
  });

  describe('Environment-based Provider Testing', () => {
    it('should test enabled providers with real API keys', async () => {
      if (TestEnv.shouldSkipIntegrationTests()) {
        console.log('Skipping real provider tests (SKIP_INTEGRATION_TESTS=true)');
        return;
      }

      const enabledProviders = TestEnv.getEnabledProviders();
      
      if (enabledProviders.length === 0) {
        console.log('No providers enabled for testing');
        return;
      }

      // Initialize with real environment
      const result = providerManager.initializeProviders({ skipEnvCheck: false });
      
      for (const enabledProvider of enabledProviders) {
        expect(result.registered).toContain(enabledProvider.name);
        
        const provider = providerManager.getProvider(enabledProvider.name);
        expect(provider).toBeDefined();
        
        const apiKey = providerManager.getProviderApiKey(enabledProvider.name);
        expect(apiKey).toBeDefined();
        
        console.log(`✅ Provider ${enabledProvider.name} is properly configured`);
      }
    });

  });

  describe('Singleton Behavior', () => {
    it('should maintain singleton instance', () => {
      const instance1 = ProviderManager.getInstance();
      const instance2 = ProviderManager.getInstance();
      
      expect(instance1).toBe(instance2);
    });

    it('should allow creating separate test instances', () => {
      const testInstance1 = ProviderManager.createTestInstance();
      const testInstance2 = ProviderManager.createTestInstance();
      const singletonInstance = ProviderManager.getInstance();
      
      expect(testInstance1).not.toBe(testInstance2);
      expect(testInstance1).not.toBe(singletonInstance);
      expect(testInstance2).not.toBe(singletonInstance);
    });
  });
});
