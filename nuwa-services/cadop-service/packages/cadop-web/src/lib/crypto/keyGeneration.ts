import {
  KeyType,
  CryptoUtils,
  MultibaseCodec,
  KeyManager,
  MemoryKeyStore,
} from '@nuwa-ai/identity-kit';

export interface GeneratedKeyInfo {
  storedKeyString: string;
  publicKeyMultibase: string;
  idFragment: string;
  keyType: KeyType;
}

/**
 * Generate a new key pair and return both the StoredKey string and public key for form filling
 * @param did The DID to associate with the key
 * @param keyType The type of key to generate
 * @param fragment Optional fragment for the key ID (defaults to timestamp-based)
 * @returns Generated key information
 */
export async function generateKeyPair(
  did: string,
  keyType: KeyType = KeyType.ED25519,
  fragment?: string
): Promise<GeneratedKeyInfo> {
  try {
    // Generate the key pair using CryptoUtils
    const { privateKey, publicKey } = await CryptoUtils.generateKeyPair(keyType);

    // Create a temporary KeyManager to handle key storage and export
    const keyFragment = fragment || `key-${Date.now()}`;
    const { keyManager, keyId } = await KeyManager.createWithKeyPair(
      did,
      { privateKey, publicKey },
      keyFragment,
      keyType,
      new MemoryKeyStore() // Use memory store for temporary key handling
    );

    // Export the key as a string for server environment variable
    const storedKeyString = await keyManager.exportKeyToString(keyId);

    // Encode public key for DID verification method
    const publicKeyMultibase = MultibaseCodec.encodeBase58btc(publicKey);

    return {
      storedKeyString,
      publicKeyMultibase,
      idFragment: keyFragment,
      keyType,
    };
  } catch (error) {
    throw new Error(
      `Failed to generate key pair: ${error instanceof Error ? error.message : 'Unknown error'}`
    );
  }
}

/**
 * Validate that a public key multibase matches the expected key type
 * @param publicKeyMultibase The base58btc encoded public key
 * @param expectedKeyType The expected key type
 * @returns True if valid, false otherwise
 */
export function validatePublicKeyFormat(
  publicKeyMultibase: string,
  expectedKeyType: KeyType
): boolean {
  try {
    const decoded = MultibaseCodec.decodeBase58btc(publicKeyMultibase);

    // Basic length validation based on key type
    switch (expectedKeyType) {
      case KeyType.ED25519:
        return decoded.length === 32; // Ed25519 public keys are 32 bytes
      case KeyType.SECP256K1:
        return decoded.length === 33; // Secp256k1 compressed public keys are 33 bytes
      default:
        return false;
    }
  } catch {
    return false;
  }
}

/**
 * Get display name for key type
 * @param keyType The key type
 * @returns Human readable name
 */
export function getKeyTypeDisplayName(keyType: KeyType): string {
  switch (keyType) {
    case KeyType.ED25519:
      return 'Ed25519VerificationKey2020';
    case KeyType.SECP256K1:
      return 'EcdsaSecp256k1VerificationKey2019';
    default:
      return keyType;
  }
}

/**
 * Convert verification method type string to KeyType enum
 * @param methodType The verification method type string
 * @returns KeyType enum value
 */
export function methodTypeToKeyType(methodType: string): KeyType {
  switch (methodType) {
    case 'Ed25519VerificationKey2020':
      return KeyType.ED25519;
    case 'EcdsaSecp256k1VerificationKey2019':
      return KeyType.SECP256K1;
    default:
      throw new Error(`Unsupported method type: ${methodType}`);
  }
}
