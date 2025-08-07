/**
 * Utility functions for Payment Kit
 */

export * from './bigint';
export * from './json';

// Import and re-export existing utils from other modules
export { DebugLogger } from '@nuwa-ai/identity-kit';

/**
 * Generate a random nonce for SubRAV
 */
export function generateNonce(): bigint {
  return BigInt(Date.now()) * BigInt(1000) + BigInt(Math.floor(Math.random() * 1000));
}

/**
 * Extract fragment from DID keyId
 * Example: 'did:rooch:0x123#test-key' -> 'test-key'
 */
export function extractFragment(keyId: string): string {
  const hashIndex = keyId.indexOf('#');
  if (hashIndex === -1) {
    throw new Error(`No fragment found in keyId: ${keyId}`);
  }
  return keyId.substring(hashIndex + 1);
}

/**
 * Validate hex string format
 */
export function isValidHex(hex: string, expectedLength?: number): boolean {
  if (!hex || typeof hex !== 'string') {
    return false;
  }
  
  if (!hex.startsWith('0x')) {
    return false;
  }
  
  const hexPart = hex.substring(2);
  
  // Check if it contains only valid hex characters
  if (!/^[0-9a-fA-F]*$/.test(hexPart)) {
    return false;
  }
  
  // Check expected length if provided
  if (expectedLength !== undefined && hexPart.length !== expectedLength) {
    return false;
  }
  
  return true;
}

/**
 * Format amount for display with decimals
 */
export function formatAmount(amount: bigint, decimals: number = 18): string {
  const divisor = BigInt(10 ** decimals);
  const whole = amount / divisor;
  const remainder = amount % divisor;
  
  if (remainder === 0n) {
    return whole.toString();
  }
  
  const remainderStr = remainder.toString().padStart(decimals, '0');
  return `${whole}.${remainderStr.replace(/0+$/, '')}`;
}

/**
 * Generate a channel ID (placeholder implementation)
 */
export function generateChannelId(): string {
  return `0x${Math.random().toString(16).substring(2).padStart(64, '0')}`;
}

/**
 * Convert BigInt to string
 */
export function bigintToString(value: bigint): string {
  return value.toString();
}

/**
 * Convert string to BigInt
 */
export function stringToBigint(value: string): bigint {
  return BigInt(value);
}

/**
 * Format picoUSD amount to human-readable USD string
 * @param picoUsd Amount in picoUSD (1 USD = 1,000,000,000,000 picoUSD)
 * @returns Formatted USD string (e.g., "$0.0123")
 */
export function formatUsdAmount(picoUsd: bigint): string {
  // 1 USD = 1,000,000,000,000 picoUSD
  const divisor = 1_000_000_000_000n;
  const whole = picoUsd / divisor;
  const remainder = picoUsd % divisor;
  // Format remainder as a 12-digit string, then take the first 4 digits for 4 decimal places
  const remainderStr = remainder.toString().padStart(12, '0').slice(0, 4);
  // Remove trailing zeros from the fractional part, but keep at least one zero if all are zero
  const fractional = remainderStr.replace(/0+$/, '') || '0';
  return `$${whole.toString()}.${fractional}`;
}