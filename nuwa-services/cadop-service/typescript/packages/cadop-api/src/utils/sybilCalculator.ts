export interface AuthMethod {
  provider: string;
  providerId: string;
  verifiedAt: Date;
  sybilContribution?: number;
  metadata?: Record<string, any>;
}

export interface SybilFactor {
  provider: string;
  contribution: number;
}

export function calculateSybilContribution(authMethod: AuthMethod): number {
  // Default contribution values for different providers
  const defaultContributions: Record<string, number> = {
    'webauthn': 1.0,
    'google': 1.0,
    'github': 1.0,
    'apple': 1.0,
    'passkey': 1.0,
    'rooch_wallet': 1.5,
    'twitter': 0.5,
    'discord': 0.5,
    'email': 0.3,
    'phone': 0.3,
  };

  // If the auth method has a custom contribution value, use that
  if (authMethod.sybilContribution !== undefined) {
    return authMethod.sybilContribution;
  }

  // Otherwise, use the default contribution for the provider
  const provider = authMethod.provider.toLowerCase();
  return defaultContributions[provider] || 0.3;
}

export function calculateSybilScore(authMethods: AuthMethod[]): number {
  if (!authMethods || !Array.isArray(authMethods)) {
    return 0;
  }

  // Group by provider to avoid double counting
  const providerGroups = new Map<string, AuthMethod[]>();
  authMethods.forEach(method => {
    const provider = method.provider.toLowerCase();
    if (!providerGroups.has(provider)) {
      providerGroups.set(provider, []);
    }
    providerGroups.get(provider)!.push(method);
  });

  // Calculate total score
  let totalScore = 0;
  providerGroups.forEach((methods, provider) => {
    // Take the highest contribution from each provider group
    const maxContribution = Math.max(
      ...methods.map(method => calculateSybilContribution(method))
    );
    totalScore += maxContribution;
  });

  return totalScore;
}

export function calculateSybilLevel(authMethods: AuthMethod[]): number {
  const score = calculateSybilScore(authMethods);
  return Math.floor(score);
}

/**
 * Get Sybil level description
 */
export function getSybilLevelDescription(level: number): string {
  switch (level) {
    case 0:
      return 'No Authentication - Basic account with minimal verification';
    case 1:
      return 'Basic Authentication - Single strong authentication method';
    case 2:
      return 'Medium Authentication - Multiple authentication methods';
    case 3:
      return 'High Authentication - Multiple strong authentication methods';
    default:
      return 'Unknown level';
  }
}

/**
 * Check if minimum Sybil level requirement for creating Agent DID is met
 */
export function meetsMinimumSybilLevel(level: number, minimumLevel: number = 1): boolean {
  return level >= minimumLevel;
} 