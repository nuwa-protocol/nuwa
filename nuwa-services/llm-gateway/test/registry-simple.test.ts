import { providerRegistry } from '../src/providers/registry.js';
import { OpenAIProvider } from '../src/providers/openai.js';

// Test the simplified registry-based API key management
describe('Simplified Registry-based API Key Management', () => {
  beforeEach(() => {
    // Clear registry before each test
    providerRegistry.clear();
  });

  test('should register provider with API key value directly', () => {
    const provider = new OpenAIProvider();
    
    providerRegistry.register({
      name: 'test-provider',
      instance: provider,
      requiresApiKey: true,
      supportsNativeUsdCost: false,
      apiKey: 'sk-test-12345',
      baseUrl: 'https://api.test.com',
      allowedPaths: ['/v1/*']
    });

    expect(providerRegistry.has('test-provider')).toBe(true);
    const config = providerRegistry.get('test-provider');
    expect(config?.apiKey).toBe('sk-test-12345');
  });

  test('should get cached API key from registry', () => {
    const provider = new OpenAIProvider();
    
    providerRegistry.register({
      name: 'test-provider-2',
      instance: provider,
      requiresApiKey: true,
      supportsNativeUsdCost: false,
      apiKey: 'sk-test-67890',
      baseUrl: 'https://api.test.com',
      allowedPaths: ['/v1/*']
    });

    const apiKey = providerRegistry.getProviderApiKey('test-provider-2');
    expect(apiKey).toBe('sk-test-67890');
  });

  test('should return null for providers that do not require API key', () => {
    const provider = new OpenAIProvider();
    
    providerRegistry.register({
      name: 'no-key-provider',
      instance: provider,
      requiresApiKey: false,
      supportsNativeUsdCost: false,
      baseUrl: 'https://api.test.com',
      allowedPaths: ['/v1/*']
    });

    const apiKey = providerRegistry.getProviderApiKey('no-key-provider');
    expect(apiKey).toBeNull();
  });

  test('should throw error when getting API key for provider that requires key but has none', () => {
    const provider = new OpenAIProvider();
    
    expect(() => {
      providerRegistry.register({
        name: 'missing-key-provider',
        instance: provider,
        requiresApiKey: true,
        supportsNativeUsdCost: false,
        // apiKey not provided
        baseUrl: 'https://api.test.com',
        allowedPaths: ['/v1/*']
      });
    }).toThrow('requires an API key but none was provided');
  });

  test('should list all registered providers', () => {
    const provider1 = new OpenAIProvider();
    const provider2 = new OpenAIProvider();
    
    providerRegistry.register({
      name: 'provider-1',
      instance: provider1,
      requiresApiKey: false,
      supportsNativeUsdCost: false,
      baseUrl: 'https://api.test1.com',
      allowedPaths: ['/v1/*']
    });

    providerRegistry.register({
      name: 'provider-2',
      instance: provider2,
      requiresApiKey: true,
      supportsNativeUsdCost: false,
      apiKey: 'sk-test-key',
      baseUrl: 'https://api.test2.com',
      allowedPaths: ['/v1/*']
    });

    const providers = providerRegistry.list();
    expect(providers).toContain('provider-1');
    expect(providers).toContain('provider-2');
    expect(providers).toHaveLength(2);
  });
});
