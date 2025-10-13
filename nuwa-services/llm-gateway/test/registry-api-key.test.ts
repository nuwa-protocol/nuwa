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
      apiKey: 'sk-test-12345'
    });

    expect(providerRegistry.has('test-provider')).toBe(true);
    const config = providerRegistry.get('test-provider');
    expect(config?.apiKey).toBe('sk-test-12345');
  });

  test('should get cached API key from registry', () => {
    const provider = new OpenAIProvider();
    
    providerRegistry.register({
      name: 'test-provider',
      instance: provider,
      requiresApiKey: true,
      supportsNativeUsdCost: false,
      apiKey: 'sk-test-12345'
    });

    const apiKey = providerRegistry.getProviderApiKey('test-provider');
    expect(apiKey).toBe('sk-test-12345');
  });

  test('should return null for providers that do not require API key', () => {
    const provider = new OpenAIProvider();
    
    providerRegistry.register({
      name: 'test-provider',
      instance: provider,
      requiresApiKey: false,
      supportsNativeUsdCost: false,
    });

    const apiKey = providerRegistry.getProviderApiKey('test-provider');
    expect(apiKey).toBeNull();
  });

  test('should throw error if provider not registered', () => {
    expect(() => {
      providerRegistry.getProviderApiKey('non-existent');
    }).toThrow("Provider 'non-existent' is not registered");
  });

  test('should throw error during registration if API key required but not provided', () => {
    const provider = new OpenAIProvider();
    
    expect(() => {
      providerRegistry.register({
        name: 'test-provider',
        instance: provider,
        requiresApiKey: true,
        supportsNativeUsdCost: false,
        // apiKey not provided
      });
    }).toThrow("Provider 'test-provider' requires an API key but none was provided");
  });

  test('should successfully register provider that does not require API key', () => {
    const provider = new OpenAIProvider();
    
    // Should not throw
    providerRegistry.register({
      name: 'test-provider',
      instance: provider,
      requiresApiKey: false,
      supportsNativeUsdCost: false,
    });

    expect(providerRegistry.has('test-provider')).toBe(true);
    const config = providerRegistry.get('test-provider');
    expect(config?.apiKey).toBeUndefined();
  });

  test('should handle API key updates by re-registration', () => {
    const provider = new OpenAIProvider();
    
    providerRegistry.register({
      name: 'test-provider',
      instance: provider,
      requiresApiKey: true,
      supportsNativeUsdCost: false,
      apiKey: 'sk-test-original'
    });

    expect(providerRegistry.getProviderApiKey('test-provider')).toBe('sk-test-original');

    // Re-register with updated API key
    providerRegistry.unregister('test-provider');
    
    providerRegistry.register({
      name: 'test-provider',
      instance: provider,
      requiresApiKey: true,
      supportsNativeUsdCost: false,
      apiKey: 'sk-test-updated'
    });

    expect(providerRegistry.getProviderApiKey('test-provider')).toBe('sk-test-updated');
  });

  test('should allow registering provider with empty API key if not required', () => {
    const provider = new OpenAIProvider();
    
    providerRegistry.register({
      name: 'local-provider',
      instance: provider,
      requiresApiKey: false,
      supportsNativeUsdCost: false,
      apiKey: undefined // Explicitly undefined
    });

    expect(providerRegistry.has('local-provider')).toBe(true);
    expect(providerRegistry.getProviderApiKey('local-provider')).toBeNull();
  });
});
