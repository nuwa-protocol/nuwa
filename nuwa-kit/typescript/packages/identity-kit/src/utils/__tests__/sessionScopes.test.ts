import {
  buildBaseScopes,
  combineScopes,
  validateScopeFormat,
  validateScopes,
  scopeObjectToString,
  scopeObjectsToStrings,
  ScopeObject,
} from '../sessionScopes';

describe('sessionScopes', () => {
  describe('buildBaseScopes', () => {
    it('should build correct base scopes', () => {
      const scopes = buildBaseScopes();

      expect(scopes).toEqual([
        '0x3::did::*',
        '0x3::payment_channel::*',
        '0xeb1deb6f1190f86cd4e05a82cfa5775a8a5929da49fac3ab8f5bf23e9181e625::*::*',
      ]);
    });
  });

  describe('combineScopes', () => {
    it('should combine base and custom scopes without duplicates', () => {
      const customScopes = [
        '0xabc::defi::*',
        '0x123::chat::send',
        '0x3::did::*', // duplicate with base scope
      ];

      const combined = combineScopes(customScopes);

      // Should include base scopes + custom scopes, with duplicates removed
      expect(combined).toEqual([
        '0x3::did::*', // base scope (duplicate removed)
        '0x3::payment_channel::*', // base scope
        '0xeb1deb6f1190f86cd4e05a82cfa5775a8a5929da49fac3ab8f5bf23e9181e625::*::*', // base scope
        '0xabc::defi::*', // custom scope
        '0x123::chat::send', // custom scope
      ]);
    });

    it('should handle empty custom scopes', () => {
      const combined = combineScopes([]);

      expect(combined).toEqual(buildBaseScopes());
    });

    it('should handle undefined custom scopes', () => {
      const combined = combineScopes();

      expect(combined).toEqual(buildBaseScopes());
    });
  });

  describe('validateScopeFormat', () => {
    it('should validate correct scope formats', () => {
      const validScopes = [
        '0x3::did::*',
        '0x1234567890abcdef::module::function',
        'rooch1abc123::*::*',
        '*::*::*',
        '0xabc::defi::swap',
      ];

      validScopes.forEach(scope => {
        expect(validateScopeFormat(scope)).toBe(true);
      });
    });

    it('should reject invalid scope formats', () => {
      const invalidScopes = [
        '', // empty
        'invalid', // missing parts
        '0x3::did', // missing function
        '0x3::did::function::extra', // too many parts
        '::did::*', // empty address
        '0x3::::*', // empty module
        '0x3::did::', // empty function
        'invalid-hex::did::*', // invalid address format
      ];

      invalidScopes.forEach(scope => {
        expect(validateScopeFormat(scope)).toBe(false);
      });
    });

    it('should handle non-string inputs', () => {
      expect(validateScopeFormat(null as any)).toBe(false);
      expect(validateScopeFormat(undefined as any)).toBe(false);
      expect(validateScopeFormat(123 as any)).toBe(false);
      expect(validateScopeFormat({} as any)).toBe(false);
    });
  });

  describe('validateScopes', () => {
    it('should validate array of valid scopes', () => {
      const scopes = ['0x3::did::*', '0xabc::defi::swap', 'rooch1test::chat::send'];

      const result = validateScopes(scopes);

      expect(result.valid).toBe(true);
      expect(result.invalidScopes).toEqual([]);
    });

    it('should identify invalid scopes in array', () => {
      const scopes = [
        '0x3::did::*', // valid
        'invalid-format', // invalid
        '0xabc::defi::swap', // valid
        '::missing::address', // invalid
      ];

      const result = validateScopes(scopes);

      expect(result.valid).toBe(false);
      expect(result.invalidScopes).toEqual(['invalid-format', '::missing::address']);
    });

    it('should handle empty array', () => {
      const result = validateScopes([]);

      expect(result.valid).toBe(true);
      expect(result.invalidScopes).toEqual([]);
    });
  });

  describe('scopeObjectToString', () => {
    it('should convert scope object to string format', () => {
      const scope: ScopeObject = {
        address: '0x3',
        module: 'did',
        func: '*',
      };

      const result = scopeObjectToString(scope);

      expect(result).toBe('0x3::did::*');
    });

    it('should handle specific function names', () => {
      const scope: ScopeObject = {
        address: '0xabc',
        module: 'defi',
        func: 'swap',
      };

      const result = scopeObjectToString(scope);

      expect(result).toBe('0xabc::defi::swap');
    });
  });

  describe('scopeObjectsToStrings', () => {
    it('should convert multiple scope objects to strings', () => {
      const scopes: ScopeObject[] = [
        { address: '0x3', module: 'did', func: '*' },
        { address: '0xabc', module: 'defi', func: 'swap' },
        { address: 'rooch1test', module: 'chat', func: 'send' },
      ];

      const result = scopeObjectsToStrings(scopes);

      expect(result).toEqual(['0x3::did::*', '0xabc::defi::swap', 'rooch1test::chat::send']);
    });

    it('should handle empty array', () => {
      const result = scopeObjectsToStrings([]);

      expect(result).toEqual([]);
    });
  });

  describe('address format validation', () => {
    it('should accept hex addresses', () => {
      const hexScopes = [
        '0x1::module::func',
        '0x1234567890abcdef::module::func',
        '0xABCDEF::module::func',
      ];

      hexScopes.forEach(scope => {
        expect(validateScopeFormat(scope)).toBe(true);
      });
    });

    it('should accept bech32 addresses', () => {
      const bech32Scopes = [
        'rooch1abc::module::func',
        'rooch1test123::module::func',
        'rooch1xyz789::module::func',
      ];

      bech32Scopes.forEach(scope => {
        expect(validateScopeFormat(scope)).toBe(true);
      });
    });

    it('should accept wildcard address', () => {
      expect(validateScopeFormat('*::module::func')).toBe(true);
    });

    it('should reject malformed hex addresses', () => {
      const malformedHex = [
        '0xGHI::module::func', // invalid hex chars
        '0::module::func', // missing x
        'x123::module::func', // missing 0
      ];

      malformedHex.forEach(scope => {
        expect(validateScopeFormat(scope)).toBe(false);
      });
    });
  });
});
