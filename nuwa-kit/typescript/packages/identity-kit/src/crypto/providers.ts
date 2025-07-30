import { KeyType } from '../types/crypto';

/**
 * Interface for key pair generation and cryptographic operations
 */
export interface CryptoProvider {
  /**
   * Generate a key pair
   * @returns A promise resolving to public and private key pair
   */
  generateKeyPair(): Promise<{ publicKey: Uint8Array; privateKey: Uint8Array }>;

  /**
   * Sign data with private key
   * @param data Data to sign
   * @param privateKey Private key to sign with (can be Uint8Array or CryptoKey)
   * @returns Signature as Uint8Array
   */
  sign(data: Uint8Array, privateKey: Uint8Array | CryptoKey): Promise<Uint8Array>;

  /**
   * Verify signature
   * @param data Original data
   * @param signature Signature to verify
   * @param publicKey Public key to verify with (can be Uint8Array or JsonWebKey)
   * @returns Whether the signature is valid
   */
  verify(
    data: Uint8Array,
    signature: Uint8Array,
    publicKey: Uint8Array | JsonWebKey
  ): Promise<boolean>;

  /**
   * Get the key type supported by this provider
   */
  getKeyType(): KeyType;

  /**
   * Derive public key from private key
   * @param privateKey The private key bytes
   * @returns The corresponding public key bytes
   */
  derivePublicKey(privateKey: Uint8Array): Promise<Uint8Array>;
}

/**
 * Interface for crypto provider factory
 */
export interface CryptoProviderFactory {
  /**
   * Create a crypto provider for the specified key type
   * @param keyType The key type to create provider for
   * @returns A crypto provider instance
   */
  createProvider(keyType: KeyType): CryptoProvider;

  /**
   * Check if this factory supports the specified key type
   * @param keyType The key type to check
   */
  supports(keyType: KeyType): boolean;
}
