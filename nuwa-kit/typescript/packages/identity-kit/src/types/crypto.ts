// Cryptographic types and constants

/**
 * Key type constants for cryptographic operations
 */
export const KEY_TYPE = {
  ED25519: 'Ed25519VerificationKey2020',
  SECP256K1: 'EcdsaSecp256k1VerificationKey2019',
  ECDSAR1: 'EcdsaSecp256r1VerificationKey2019',
} as const;

export type KeyType = (typeof KEY_TYPE)[keyof typeof KEY_TYPE];

/**
 * Type guard to check if a string is a valid KeyType
 */
export function isKeyType(value: string): value is KeyType {
  return Object.values(KEY_TYPE).includes(value as KeyType);
}

/**
 * Convert a string to KeyType, with runtime validation
 * @throws Error if the string is not a valid KeyType
 */
export function toKeyType(value: string): KeyType {
  if (isKeyType(value)) {
    return value;
  }
  throw new Error(`Invalid key type: ${value}`);
}

/**
 * https://www.w3.org/TR/webauthn-2/#typedefdef-cosealgorithmidentifier
 * Convert a WebAuthn public key algorithm to KeyType, with runtime validation
 * @throws Error if the string is not a valid KeyType
 */
export function algorithmToKeyType(algorithm: number): KeyType | undefined {
  switch (algorithm) {
    case -8:
      return KEY_TYPE.ED25519;
    case -7:
      return KEY_TYPE.ECDSAR1;
    default:
      return undefined;
  }
}

/**
 * Convert a KeyType to WebAuthn algorithm identifier
 */
export function keyTypeToAlgorithm(keyType: KeyType): number | undefined {
  switch (keyType) {
    case KEY_TYPE.ED25519:
      return -8;
    case KEY_TYPE.ECDSAR1:
      return -7;
    default:
      return undefined;
  }
}

/**
 * Get list of supported WebAuthn algorithms
 */
export function getSupportedAlgorithms(): number[] {
  return [-8, -7];
}

/**
 * Type that represents either a KeyType or a string
 * Useful for functions that need to accept both strict KeyType and general string values
 */
export type KeyTypeInput = KeyType | string;

/**
 * Represents the information needed to create a new operational key.
 */
export interface OperationalKeyInfo {
  idFragment?: string; // Optional fragment for the key id (e.g., 'key-2'). If not provided, one might be generated.
  type: string; // Cryptographic suite of the key, e.g., Ed25519VerificationKey2020
  publicKeyMaterial: Uint8Array | JsonWebKey; // The public key material
  controller?: string; // Defaults to the master DID if not provided
}