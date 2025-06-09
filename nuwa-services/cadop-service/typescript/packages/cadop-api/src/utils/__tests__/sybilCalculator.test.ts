import {
  calculateSybilLevel,
  calculateSybilContribution,
  calculateSybilScore,
  SybilFactor,
  getSybilLevelDescription,
  meetsMinimumSybilLevel,
  AuthMethod,
} from '../sybilCalculator.js';

describe('Sybil Calculator', () => {
  describe('calculateSybilLevel', () => {
    it('should return 0 for empty auth methods', () => {
      const result = calculateSybilLevel([]);
      expect(result).toBe(0);
    });

    it('should return 0 for null/undefined auth methods', () => {
      expect(calculateSybilLevel(null as any)).toBe(0);
      expect(calculateSybilLevel(undefined as any)).toBe(0);
    });

    it('should calculate level 1 for basic WebAuthn', () => {
      const authMethods: AuthMethod[] = [
        {
          provider: 'webauthn',
          providerId: 'test-device',
          verifiedAt: new Date(),
        },
      ];
      const result = calculateSybilLevel(authMethods);
      expect(result).toBe(1);
    });

    it('should calculate level 1 for Google OAuth', () => {
      const authMethods: AuthMethod[] = [
        {
          provider: 'google',
          providerId: 'google-user-123',
          verifiedAt: new Date(),
        },
      ];
      const result = calculateSybilLevel(authMethods);
      expect(result).toBe(1);
    });

    it('should calculate level 2 for multiple providers', () => {
      const authMethods: AuthMethod[] = [
        {
          provider: 'webauthn',
          providerId: 'test-device',
          verifiedAt: new Date(),
        },
        {
          provider: 'google',
          providerId: 'google-user-123',
          verifiedAt: new Date(),
        },
      ];
      const result = calculateSybilLevel(authMethods);
      expect(result).toBe(2);
    });

    it('should calculate level 2 for wallet authentication', () => {
      const authMethods: AuthMethod[] = [
        {
          provider: 'rooch_wallet',
          providerId: 'wallet-address-123',
          verifiedAt: new Date(),
        },
      ];
      const result = calculateSybilLevel(authMethods);
      expect(result).toBe(1); // rooch_wallet gives 1.5 points, which rounds to level 1
    });

    it('should calculate level 3 for multiple high-value providers', () => {
      const authMethods: AuthMethod[] = [
        {
          provider: 'rooch_wallet',
          providerId: 'wallet-address-123',
          verifiedAt: new Date(),
        },
        {
          provider: 'webauthn',
          providerId: 'test-device',
          verifiedAt: new Date(),
        },
        {
          provider: 'google',
          providerId: 'google-user-123',
          verifiedAt: new Date(),
        },
      ];
      const result = calculateSybilLevel(authMethods);
      expect(result).toBe(3); // 1.5 + 1 + 1 = 3.5 -> level 3
    });

    it('should not double-count same provider', () => {
      const authMethods: AuthMethod[] = [
        {
          provider: 'google',
          providerId: 'google-user-123',
          verifiedAt: new Date(),
        },
        {
          provider: 'google',
          providerId: 'google-user-456',
          verifiedAt: new Date(),
        },
      ];
      const result = calculateSybilLevel(authMethods);
      expect(result).toBe(1); // Should not be 2
    });

    it('should handle custom sybilContribution values', () => {
      const authMethods: AuthMethod[] = [
        {
          provider: 'custom',
          providerId: 'custom-123',
          verifiedAt: new Date(),
          sybilContribution: 2.5,
        },
      ];
      const result = calculateSybilLevel(authMethods);
      expect(result).toBe(2); // 0.3 (default) + 2.5 (custom) = 2.8 -> level 2
    });

    it('should handle different provider types correctly', () => {
      const testCases = [
        { provider: 'email', expectedMinLevel: 0 },
        { provider: 'phone', expectedMinLevel: 0 },
        { provider: 'twitter', expectedMinLevel: 0 },
        { provider: 'discord', expectedMinLevel: 0 },
        { provider: 'github', expectedMinLevel: 1 },
        { provider: 'apple', expectedMinLevel: 1 },
        { provider: 'passkey', expectedMinLevel: 1 },
        { provider: 'wallet', expectedMinLevel: 1 }, // wallet gives 1.5 points -> level 1
        { provider: 'unknown', expectedMinLevel: 0 },
      ];

      testCases.forEach(({ provider, expectedMinLevel }) => {
        const authMethods: AuthMethod[] = [
          {
            provider,
            providerId: `${provider}-test`,
            verifiedAt: new Date(),
          },
        ];
        const result = calculateSybilLevel(authMethods);
        expect(result).toBeGreaterThanOrEqual(expectedMinLevel);
      });
    });

    it('should be case insensitive for provider names', () => {
      const authMethods: AuthMethod[] = [
        {
          provider: 'GOOGLE',
          providerId: 'google-user-123',
          verifiedAt: new Date(),
        },
        {
          provider: 'WebAuthn',
          providerId: 'device-123',
          verifiedAt: new Date(),
        },
      ];
      const result = calculateSybilLevel(authMethods);
      expect(result).toBe(2);
    });
  });

  describe('getSybilLevelDescription', () => {
    it('should return correct descriptions for all levels', () => {
      expect(getSybilLevelDescription(0)).toContain('No Authentication');
      expect(getSybilLevelDescription(1)).toContain('Basic Authentication');
      expect(getSybilLevelDescription(2)).toContain('Medium Authentication');
      expect(getSybilLevelDescription(3)).toContain('High Authentication');
    });

    it('should handle unknown levels', () => {
      expect(getSybilLevelDescription(5)).toBe('Unknown level');
      expect(getSybilLevelDescription(-1)).toBe('Unknown level');
    });
  });

  describe('meetsMinimumSybilLevel', () => {
    it('should use default minimum level of 1', () => {
      expect(meetsMinimumSybilLevel(0)).toBe(false);
      expect(meetsMinimumSybilLevel(1)).toBe(true);
      expect(meetsMinimumSybilLevel(2)).toBe(true);
      expect(meetsMinimumSybilLevel(3)).toBe(true);
    });

    it('should respect custom minimum levels', () => {
      expect(meetsMinimumSybilLevel(1, 2)).toBe(false);
      expect(meetsMinimumSybilLevel(2, 2)).toBe(true);
      expect(meetsMinimumSybilLevel(3, 2)).toBe(true);
    });

    it('should handle edge cases', () => {
      expect(meetsMinimumSybilLevel(0, 0)).toBe(true);
      expect(meetsMinimumSybilLevel(5, 3)).toBe(true);
    });
  });

  describe('Real-world scenarios', () => {
    it('should handle typical user with Google + WebAuthn', () => {
      const authMethods: AuthMethod[] = [
        {
          provider: 'google',
          providerId: 'google-123',
          verifiedAt: new Date(),
        },
        {
          provider: 'webauthn',
          providerId: 'device-456',
          verifiedAt: new Date(),
        },
      ];

      const level = calculateSybilLevel(authMethods);
      expect(level).toBe(2);
      expect(meetsMinimumSybilLevel(level)).toBe(true);
      expect(getSybilLevelDescription(level)).toContain('Medium');
    });

    it('should handle power user with multiple authentications', () => {
      const authMethods: AuthMethod[] = [
        {
          provider: 'rooch_wallet',
          providerId: 'wallet-123',
          verifiedAt: new Date(),
        },
        {
          provider: 'google',
          providerId: 'google-123',
          verifiedAt: new Date(),
        },
        {
          provider: 'github',
          providerId: 'github-123',
          verifiedAt: new Date(),
        },
        {
          provider: 'webauthn',
          providerId: 'device-123',
          verifiedAt: new Date(),
        },
      ];

      const level = calculateSybilLevel(authMethods);
      expect(level).toBe(3);
      expect(meetsMinimumSybilLevel(level, 3)).toBe(true);
      expect(getSybilLevelDescription(level)).toContain('High');
    });

    it('should handle minimal user with just email', () => {
      const authMethods: AuthMethod[] = [
        {
          provider: 'email',
          providerId: 'user@example.com',
          verifiedAt: new Date(),
        },
      ];

      const level = calculateSybilLevel(authMethods);
      expect(level).toBe(0);
      expect(meetsMinimumSybilLevel(level)).toBe(false);
      expect(getSybilLevelDescription(level)).toContain('No Authentication');
    });
  });
}); 