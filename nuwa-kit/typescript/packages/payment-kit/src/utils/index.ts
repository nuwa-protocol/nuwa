/**
 * Utility functions for payment kit
 */

// Re-export DebugLogger from identity-kit to maintain consistency
export { DebugLogger } from '@nuwa-ai/identity-kit';

/**
 * Convert BigInt to string safely
 */
export function bigintToString(value: bigint): string {
  return value.toString();
}

/**
 * Convert string to BigInt safely
 */
export function stringToBigint(value: string): bigint {
  return BigInt(value);
}

/**
 * Generate a random nonce
 */
export function generateNonce(): bigint {
  return BigInt(Date.now()) * BigInt(1000) + BigInt(Math.floor(Math.random() * 1000));
}

/**
 * Generate a deterministic channel ID from payer and payee DIDs
 */
export function generateChannelId(payerDid: string, payeeDid: string, asset: string): string {
  // This is a placeholder implementation
  // In real implementation, this should use a proper hash function
  const input = `${payerDid}:${payeeDid}:${asset}`;
  const hash = Array.from(input)
    .reduce((hash, char) => {
      return ((hash << 5) - hash) + char.charCodeAt(0);
    }, 0);
  
  // Convert to 32-byte hex string
  const hashStr = Math.abs(hash).toString(16).padStart(8, '0');
  return '0x' + hashStr.repeat(8).substring(0, 64);
}

/**
 * Extract fragment from a DID key ID
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
export function isValidHex(value: string, expectedLength?: number): boolean {
  if (!value.startsWith('0x')) {
    return false;
  }
  
  const hex = value.substring(2);
  if (!/^[0-9a-fA-F]+$/.test(hex)) {
    return false;
  }
  
  if (expectedLength && hex.length !== expectedLength) {
    return false;
  }
  
  return true;
}

/**
 * Format amount for display
 */
export function formatAmount(amount: bigint, decimals: number = 18): string {
  const divisor = BigInt(10 ** decimals);
  const whole = amount / divisor;
  const remainder = amount % divisor;
  
  if (remainder === 0n) {
    return whole.toString();
  }
  
  const remainderStr = remainder.toString().padStart(decimals, '0');
  const trimmed = remainderStr.replace(/0+$/, '');
  
  return `${whole}.${trimmed}`;
} 