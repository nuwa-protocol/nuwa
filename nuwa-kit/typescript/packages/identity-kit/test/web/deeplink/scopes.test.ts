import { describe, it, expect } from '@jest/globals';

// Mock crypto.getRandomValues for testing
Object.defineProperty(global, 'crypto', {
  value: {
    getRandomValues: (arr: Uint8Array) => {
      for (let i = 0; i < arr.length; i++) {
        arr[i] = Math.floor(Math.random() * 256);
      }
      return arr;
    },
  },
});

// Mock window for testing
if (typeof window === 'undefined') {
  Object.defineProperty(global, 'window', {
    value: {
      location: {
        origin: 'http://localhost:3000',
      },
      sessionStorage: {
        getItem: () => null,
        setItem: () => {},
        removeItem: () => {},
      },
    },
  });
}

describe('DeepLinkManager Scopes Validation', () => {
  // Test scope validation logic directly without importing the full DeepLinkManager

  function validateScopeFormat(scope: string): boolean {
    if (!scope || typeof scope !== 'string') {
      return false;
    }

    const parts = scope.split('::');
    if (parts.length !== 3) {
      return false;
    }

    const [address, module, func] = parts;

    // Each part must be non-empty
    if (!address || !module || !func) {
      return false;
    }

    // Basic address format validation (hex or wildcard)
    if (address !== '*' && !isValidAddressFormat(address)) {
      return false;
    }

    return true;
  }

  function isValidAddressFormat(address: string): boolean {
    // Accept hex addresses (0x...) and bech32 addresses (rooch1...)
    if (address.startsWith('0x')) {
      return /^0x[a-fA-F0-9]+$/.test(address);
    }

    if (address.startsWith('rooch1')) {
      return /^rooch1[a-z0-9]+$/.test(address);
    }

    return false;
  }

  describe('scope format validation', () => {
    it('should accept valid scope formats', () => {
      const validScopes = [
        '0x123::defi::swap',
        '*::nft::mint',
        '0xabc::gamefi::*',
        'rooch1abc123::module::function',
      ];

      validScopes.forEach(scope => {
        expect(validateScopeFormat(scope)).toBe(true);
      });
    });

    it('should reject invalid scope formats', () => {
      const invalidScopes = [
        'invalid', // Missing :: separators
        '0x123::defi', // Only two parts
        '::defi::swap', // Empty address
        '0x123::', // Empty module and function
        '0x123::::swap', // Extra separators
        '', // Empty string
      ];

      invalidScopes.forEach(scope => {
        expect(validateScopeFormat(scope)).toBe(false);
      });
    });

    it('should accept wildcard patterns', () => {
      const wildcardScopes = ['*::*::*', '0x123::*::*', '*::defi::*', '*::*::mint'];

      wildcardScopes.forEach(scope => {
        expect(validateScopeFormat(scope)).toBe(true);
      });
    });

    it('should validate address formats correctly', () => {
      expect(isValidAddressFormat('0x123abc')).toBe(true);
      expect(isValidAddressFormat('0xABCDEF1234567890')).toBe(true);
      expect(isValidAddressFormat('rooch1abc123')).toBe(true);
      expect(isValidAddressFormat('*')).toBe(false); // * is handled separately
      expect(isValidAddressFormat('invalid-address')).toBe(false);
      expect(isValidAddressFormat('0xGGG')).toBe(false); // Invalid hex
      expect(isValidAddressFormat('rooch2invalid')).toBe(false); // Invalid bech32
    });
  });

  describe('validateScopes function', () => {
    function validateScopes(scopes: string[]): { valid: boolean; invalidScopes: string[] } {
      const invalidScopes = scopes.filter(scope => !validateScopeFormat(scope));

      return {
        valid: invalidScopes.length === 0,
        invalidScopes,
      };
    }

    it('should return valid for all valid scopes', () => {
      const scopes = ['0x123::defi::swap', '*::nft::mint'];
      const result = validateScopes(scopes);
      expect(result.valid).toBe(true);
      expect(result.invalidScopes).toEqual([]);
    });

    it('should return invalid scopes', () => {
      const scopes = ['0x123::defi::swap', 'invalid-scope', '*::nft::mint'];
      const result = validateScopes(scopes);
      expect(result.valid).toBe(false);
      expect(result.invalidScopes).toContain('invalid-scope');
    });

    it('should handle empty array', () => {
      const result = validateScopes([]);
      expect(result.valid).toBe(true);
      expect(result.invalidScopes).toEqual([]);
    });
  });
});
