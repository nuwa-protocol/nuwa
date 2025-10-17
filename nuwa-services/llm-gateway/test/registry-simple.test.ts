import { ProviderManager } from '../src/core/providerManager.js';
import { OpenAIProvider } from '../src/providers/openai.js';

// Test the simplified registry-based API key management
describe('Simplified Registry-based API Key Management', () => {
  let providerManager: ProviderManager;

  beforeEach(() => {
    // Create a fresh test instance for each test
    providerManager = ProviderManager.createTestInstance();
  });

  test('should register provider with API key value directly', () => {
    const provider = new OpenAIProvider();
    
    providerManager.register({
      name: 'test-provider',
      instance: provider,
      requiresApiKey: true,
      supportsNativeUsdCost: false,
      apiKey: 'sk-test-12345',
      baseUrl: 'https://api.test.com',
      allowedPaths: ['/v1/*']
    });

    expect(providerManager.has('test-provider')).toBe(true);
    const config = providerManager.get('test-provider');
    expect(config?.apiKey).toBe('sk-test-12345');
  });

  test('should get cached API key from registry', () => {
    const provider = new OpenAIProvider();
    
    providerManager.register({
      name: 'test-provider-2',
      instance: provider,
      requiresApiKey: true,
      supportsNativeUsdCost: false,
      apiKey: 'sk-test-67890',
      baseUrl: 'https://api.test.com',
      allowedPaths: ['/v1/*']
    });

    const apiKey = providerManager.getProviderApiKey('test-provider-2');
    expect(apiKey).toBe('sk-test-67890');
  });

  test('should return null for providers that do not require API key', () => {
    const provider = new OpenAIProvider();
    
    providerManager.register({
      name: 'no-key-provider',
      instance: provider,
      requiresApiKey: false,
      supportsNativeUsdCost: false,
      baseUrl: 'https://api.test.com',
      allowedPaths: ['/v1/*']
    });

    const apiKey = providerManager.getProviderApiKey('no-key-provider');
    expect(apiKey).toBeNull();
  });

  test('should throw error when getting API key for provider that requires key but has none', () => {
    const provider = new OpenAIProvider();
    
    // Register provider without API key
    providerManager.register({
      name: 'missing-key-provider',
      instance: provider,
      requiresApiKey: true,
      supportsNativeUsdCost: false,
      // apiKey not provided
      baseUrl: 'https://api.test.com',
      allowedPaths: ['/v1/*']
    });

    // Should throw when trying to get API key
    expect(() => {
      providerManager.getProviderApiKey('missing-key-provider');
    }).toThrow('API key not available for provider');
  });

  test('should list all registered providers', () => {
    const provider1 = new OpenAIProvider();
    const provider2 = new OpenAIProvider();
    
    providerManager.register({
      name: 'provider-1',
      instance: provider1,
      requiresApiKey: false,
      supportsNativeUsdCost: false,
      baseUrl: 'https://api.test1.com',
      allowedPaths: ['/v1/*']
    });

    providerManager.register({
      name: 'provider-2',
      instance: provider2,
      requiresApiKey: true,
      supportsNativeUsdCost: false,
      apiKey: 'sk-test-key',
      baseUrl: 'https://api.test2.com',
      allowedPaths: ['/v1/*']
    });

    const providers = providerManager.list();
    expect(providers).toContain('provider-1');
    expect(providers).toContain('provider-2');
    expect(providers).toHaveLength(2);
  });
});
