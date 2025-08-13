/**
 * Session-Key Scope utilities for Rooch DID
 *
 * This module provides utilities for managing Session-Key Scopes that control
 * which contract functions a Session-Key can call on the Rooch blockchain.
 */

/**
 * Build base scopes that should be available to all Session-Keys
 * These provide essential DID and payment functionality.
 *
 * @returns Array of base scope strings in "address::module::function" format
 */
export function buildBaseScopes(): string[] {
  return [
    '0x3::did::*', // DID contract - all functions
    '0x3::payment_channel::*', // Payment channel contract - all functions
    '0xdc2a3eba923548660bb642b9df42936941a03e2d8bab223ae6dda6318716e742::*::*', // Cap Registry contract - all functions
  ];
}

/**
 * Combine base scopes with custom scopes and remove duplicates
 *
 * @param customScopes - Additional scopes to include
 * @returns Deduplicated array of scope strings
 */
export function combineScopes(customScopes: string[] = []): string[] {
  const baseScopes = buildBaseScopes();
  const allScopes = [...baseScopes, ...customScopes];

  // Remove duplicates while preserving order
  return Array.from(new Set(allScopes));
}

/**
 * Validate that a scope string has the correct format
 * Expected format: "address::module::function"
 * Each part can use "*" as a wildcard
 *
 * @param scope - Scope string to validate
 * @returns true if valid, false otherwise
 */
export function validateScopeFormat(scope: string): boolean {
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

  // Address should be either '*' or valid hex/bech32 format (basic check)
  if (address !== '*' && !isValidAddressFormat(address)) {
    return false;
  }

  // Module and function can be any non-empty string or '*'
  return true;
}

/**
 * Validate multiple scope strings
 *
 * @param scopes - Array of scope strings to validate
 * @returns Object with validation result and any invalid scopes
 */
export function validateScopes(scopes: string[]): {
  valid: boolean;
  invalidScopes: string[];
} {
  const invalidScopes = scopes.filter(scope => !validateScopeFormat(scope));

  return {
    valid: invalidScopes.length === 0,
    invalidScopes,
  };
}

/**
 * Basic validation for address format
 * Accepts hex addresses (0x...) and bech32 addresses (rooch1...)
 *
 * @param address - Address string to validate
 * @returns true if format appears valid
 */
export function isValidAddressFormat(address: string): boolean {
  // Hex address format (0x followed by hex characters)
  if (address.startsWith('0x')) {
    return /^0x[0-9a-fA-F]+$/.test(address);
  }

  // Bech32 format (rooch1 followed by valid characters)
  if (address.startsWith('rooch1')) {
    return /^rooch1[0-9a-z]+$/.test(address);
  }

  // Only allow specific valid formats, reject everything else
  return false;
}

/**
 * Convert a more readable scope object to string format
 * This provides a type-safe way to construct scopes
 */
export interface ScopeObject {
  address: string;
  module: string;
  func: string;
}

/**
 * Convert scope object to string format
 *
 * @param scope - Scope object
 * @returns Scope string in "address::module::function" format
 */
export function scopeObjectToString(scope: ScopeObject): string {
  return `${scope.address}::${scope.module}::${scope.func}`;
}

/**
 * Convert multiple scope objects to string format
 *
 * @param scopes - Array of scope objects
 * @returns Array of scope strings
 */
export function scopeObjectsToStrings(scopes: ScopeObject[]): string[] {
  return scopes.map(scopeObjectToString);
}
