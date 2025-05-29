export interface AuthMethod {
  provider: string;
  providerId: string;
  verifiedAt: Date;
  sybilContribution?: number;
  metadata?: Record<string, any>;
}

/**
 * Calculate user's Sybil protection level
 * Based on the number and quality of user's authentication methods
 */
export function calculateSybilLevel(authMethods: AuthMethod[]): number {
  if (!authMethods || authMethods.length === 0) {
    return 0;
  }

  let score = 0;
  const uniqueProviders = new Set<string>();

  for (const method of authMethods) {
    // Avoid duplicate calculations for the same provider
    if (uniqueProviders.has(method.provider)) {
      continue;
    }
    uniqueProviders.add(method.provider);

    // Assign scores based on authentication provider trustworthiness
    switch (method.provider.toLowerCase()) {
      case 'passkey':
      case 'webauthn':
        score += 1; // Basic biometric authentication
        break;
      case 'email':
        score += 0.5; // Email verification
        break;
      case 'google':
      case 'github':
      case 'apple':
        score += 1; // Major OAuth providers
        break;
      case 'twitter':
      case 'discord':
        score += 0.8; // Social media authentication
        break;
      case 'phone':
        score += 0.7; // Phone verification
        break;
      case 'wallet':
      case 'rooch_wallet':
        score += 1.5; // Wallet authentication, higher trustworthiness
        break;
      default:
        score += 0.3; // Other authentication methods
        break;
    }

    // Use preset contribution values (if any)
    if (method.sybilContribution) {
      score += method.sybilContribution;
    }
  }

  // Convert score to 0-3 level
  if (score >= 3) {
    return 3; // Highest level
  } else if (score >= 2) {
    return 2; // High level
  } else if (score >= 1) {
    return 1; // Medium level
  } else {
    return 0; // Low level or no authentication
  }
}

/**
 * Get Sybil level description
 */
export function getSybilLevelDescription(level: number): string {
  switch (level) {
    case 0:
      return 'No Authentication - Cannot create Agent DID';
    case 1:
      return 'Basic Authentication - Can create basic Agent DID';
    case 2:
      return 'Medium Authentication - Can create standard Agent DID';
    case 3:
      return 'High Authentication - Can create advanced Agent DID';
    default:
      return 'Unknown level';
  }
}

/**
 * Check if minimum Sybil level requirement for creating Agent DID is met
 */
export function meetsMinimumSybilLevel(level: number, required: number = 1): boolean {
  return level >= required;
} 