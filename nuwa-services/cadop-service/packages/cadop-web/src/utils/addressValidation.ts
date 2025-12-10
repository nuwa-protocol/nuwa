/**
 * Address validation and conversion utilities for Rooch addresses and DIDs
 */

import {
  isValidRoochAddress as sdkIsValidRoochAddress,
  decodeToRoochAddressStr,
} from '@roochnetwork/rooch-sdk';

/**
 * Validates if a string is a valid Rooch address format (0x... or bech32 rooch1...)
 */
export function isValidRoochAddress(address: string): boolean {
  return sdkIsValidRoochAddress(address);
}

/**
 * Validates if a string is a valid DID format
 * Supports hex (0x...) and bech32 (rooch1...) identifiers
 */
export function isValidDID(did: string): boolean {
  return /^did:rooch:(0x[a-fA-F0-9]{1,64}|rooch1[0-9a-z]+)$/.test(did);
}

/**
 * Normalizes an address input (supports both DID and Rooch address formats)
 * @param input - The input string (DID or Rooch address)
 * @returns normalized Rooch address
 * @throws Error if format is invalid
 */
export function normalizeAddress(input: string): string {
  const trimmed = input.trim();

  if (isValidDID(trimmed)) {
    // Extract identifier and normalize (supports hex / rooch1)
    const identifier = trimmed.split(':')[2];
    return decodeToRoochAddressStr(identifier);
  }

  if (isValidRoochAddress(trimmed)) {
    // decodeToRoochAddressStr handles 0x / rooch1 / bitcoin formats and returns hex 0x...
    return decodeToRoochAddressStr(trimmed);
  }

  throw new Error(
    'Invalid address format. Expected Rooch address (0x.../rooch1...) or DID (did:rooch:0x...)'
  );
}

/**
 * Converts a Rooch address to DID format
 * @param address - The Rooch address
 * @returns DID format string
 */
export function addressToDid(address: string): string {
  if (!isValidRoochAddress(address)) {
    throw new Error('Invalid Rooch address format');
  }
  const normalized = decodeToRoochAddressStr(address);
  return `did:rooch:${normalized}`;
}

/**
 * Converts a DID to Rooch address format
 * @param did - The DID string
 * @returns Rooch address string
 */
export function didToAddress(did: string): string {
  if (!isValidDID(did)) {
    throw new Error('Invalid DID format');
  }
  const identifier = did.split(':')[2];
  return decodeToRoochAddressStr(identifier);
}

/**
 * Validates and formats an address for display
 * @param input - The input string (DID or Rooch address)
 * @returns formatted address for display (shortened if long)
 */
export function formatAddressDisplay(input: string): string {
  try {
    const normalized = normalizeAddress(input);
    if (normalized.length <= 16) {
      return normalized;
    }
    // Show first 8 and last 8 characters: 0x1234...5678
    return `${normalized.slice(0, 10)}...${normalized.slice(-8)}`;
  } catch {
    // If invalid, return truncated original
    const trimmed = input.trim();
    if (trimmed.length <= 16) {
      return trimmed;
    }
    return `${trimmed.slice(0, 8)}...${trimmed.slice(-8)}`;
  }
}

/**
 * Validates amount string for transfer
 * @param amount - The amount string to validate
 * @param maxAmount - Maximum allowed amount
 * @param decimals - Number of decimal places
 * @returns validation result
 */
export function validateAmount(
  amount: string,
  maxAmount: bigint,
  decimals: number
): { valid: boolean; error?: string; parsedAmount?: bigint } {
  if (!amount || amount.trim() === '') {
    return { valid: false, error: 'Amount is required' };
  }

  const trimmed = amount.trim();

  // Check if it's a valid number format
  if (!/^\d*\.?\d*$/.test(trimmed)) {
    return { valid: false, error: 'Invalid amount format' };
  }

  // Convert string to bigint with decimals
  try {
    const parts = trimmed.split('.');
    const integerPart = parts[0] || '0';
    const fractionalPart = (parts[1] || '').padEnd(decimals, '0').slice(0, decimals);
    const parsedAmount = BigInt(integerPart + fractionalPart);

    if (parsedAmount <= 0n) {
      return { valid: false, error: 'Amount must be greater than 0' };
    }

    if (parsedAmount > maxAmount) {
      return { valid: false, error: 'Amount exceeds available balance' };
    }

    return { valid: true, parsedAmount };
  } catch (e) {
    return { valid: false, error: 'Invalid amount' };
  }
}

/**
 * Formats bigint amount to display string with decimals
 * @param amount - The amount in bigint
 * @param decimals - Number of decimal places
 * @param precision - Maximum decimal places to display (default: all)
 * @returns formatted amount string
 */
export function formatAmount(amount: bigint, decimals: number, precision?: number): string {
  const amountStr = amount.toString().padStart(decimals + 1, '0');
  const integerPart = amountStr.slice(0, -decimals) || '0';
  let fractionalPart = amountStr.slice(-decimals);

  // Remove trailing zeros
  fractionalPart = fractionalPart.replace(/0+$/, '');

  if (fractionalPart === '') {
    return integerPart;
  }

  // Apply precision if specified
  if (precision !== undefined && precision < fractionalPart.length) {
    fractionalPart = fractionalPart.slice(0, precision);
  }

  return `${integerPart}.${fractionalPart}`;
}

/**
 * Parses amount string with decimals to bigint
 * @param amount - The amount string
 * @param decimals - Number of decimal places
 * @returns bigint amount
 */
export function parseAmount(amount: string, decimals: number): bigint {
  const parts = amount.split('.');
  const integerPart = parts[0] || '0';
  const fractionalPart = (parts[1] || '').padEnd(decimals, '0').slice(0, decimals);
  return BigInt(integerPart + fractionalPart);
}

/**
 * Percentage calculation helpers
 */
export const PercentageHelpers = {
  /**
   * Calculate percentage of an amount
   */
  calculatePercentage: (amount: bigint, percentage: number): bigint => {
    return (amount * BigInt(percentage)) / 100n;
  },

  /**
   * Get common percentage options for quick selection
   */
  getPercentageOptions: (): { value: number; label: string }[] => [
    { value: 25, label: '25%' },
    { value: 50, label: '50%' },
    { value: 75, label: '75%' },
    { value: 100, label: '100%' },
  ],
};
