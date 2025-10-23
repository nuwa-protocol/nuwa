import { describe, it, expect } from '@jest/globals';
import { AUTH_PROVIDERS } from '../src';

describe('CadopIdentityKit Unit Tests', () => {
  describe('Provider Constants', () => {
    it('should have correct AUTH_PROVIDERS constants', () => {
      expect(AUTH_PROVIDERS.WEBAUTHN).toBe('webauthn');
      expect(AUTH_PROVIDERS.BITCOIN).toBe('bitcoin');
      expect(AUTH_PROVIDERS.ETHEREUM).toBe('ethereum');
    });

    it('should export all expected provider types', () => {
      // Note: ethereum support will be added when contract layer supports it
      const expectedProviders = ['webauthn', 'bitcoin', 'ethereum'];
      const actualProviders = Object.values(AUTH_PROVIDERS);

      expectedProviders.forEach(provider => {
        expect(actualProviders).toContain(provider);
      });
    });
  });

  describe('Type Definitions', () => {
    it('should have consistent AUTH_PROVIDERS object structure', () => {
      expect(typeof AUTH_PROVIDERS).toBe('object');
      expect(AUTH_PROVIDERS).not.toBeNull();

      // Check that all values are strings
      Object.values(AUTH_PROVIDERS).forEach(value => {
        expect(typeof value).toBe('string');
      });
    });
  });
});
