import { KeyType, KeyTypeInput, toKeyType } from '../types/crypto';
import { defaultCryptoProviderFactory } from './factory';

/**
 * CryptoUtils provides cross-platform cryptographic utilities for DID operations.
 * It abstracts the complexity of different key types and formats.
 */
export class CryptoUtils {
  /**
   * Generates a key pair based on the specified curve
   * @param type The key type to generate (Ed25519VerificationKey2020 or EcdsaSecp256k1VerificationKey2019 or EcdsaSecp256r1VerificationKey2019)
   * @returns A key pair containing public and private keys
   */
  static async generateKeyPair(
    type: KeyTypeInput = KeyType.ED25519
  ): Promise<{ publicKey: Uint8Array; privateKey: Uint8Array }> {
    const keyType = typeof type === 'string' ? toKeyType(type) : type;
    const provider = defaultCryptoProviderFactory.createProvider(keyType);
    return provider.generateKeyPair();
  }

  /**
   * Signs data using the specified private key
   * @param data The data to sign
   * @param privateKey The private key to use for signing (can be Uint8Array or CryptoKey)
   * @param type The key type (Ed25519VerificationKey2020 or EcdsaSecp256k1VerificationKey2019)
   * @returns The signature as a Uint8Array
   */
  static async sign(
    data: Uint8Array,
    privateKey: Uint8Array | CryptoKey,
    type: KeyTypeInput
  ): Promise<Uint8Array> {
    const keyType = typeof type === 'string' ? toKeyType(type) : type;
    const provider = defaultCryptoProviderFactory.createProvider(keyType);
    return provider.sign(data, privateKey);
  }

  /**
   * Verifies a signature using the specified public key
   * @param data The original data
   * @param signature The signature to verify
   * @param publicKey The public key to use for verification (can be Uint8Array or JsonWebKey)
   * @param type The key type (Ed25519VerificationKey2020 or EcdsaSecp256k1VerificationKey2019)
   * @returns Whether the signature is valid
   */
  static async verify(
    data: Uint8Array,
    signature: Uint8Array,
    publicKey: Uint8Array | JsonWebKey,
    type: KeyTypeInput
  ): Promise<boolean> {
    const keyType = typeof type === 'string' ? toKeyType(type) : type;
    const provider = defaultCryptoProviderFactory.createProvider(keyType);
    return provider.verify(data, signature, publicKey);
  }

  /**
   * Derive public key from private key
   * @param privateKey The private key bytes
   * @param keyType The key type
   * @returns The corresponding public key bytes
   */
  static async derivePublicKey(privateKey: Uint8Array, keyType: KeyTypeInput): Promise<Uint8Array> {
    const type = typeof keyType === 'string' ? toKeyType(keyType) : keyType;
    const provider = defaultCryptoProviderFactory.createProvider(type);
    return provider.derivePublicKey(privateKey);
  }

  /**
   * Validate the consistency between a private key and public key pair
   * @param privateKey The private key bytes
   * @param publicKey The public key bytes
   * @param keyType The key type
   * @returns true if the keys are consistent, false otherwise
   */
  static async validateKeyPairConsistency(
    privateKey: Uint8Array,
    publicKey: Uint8Array,
    keyType: KeyTypeInput
  ): Promise<boolean> {
    try {
      // Derive public key from private key
      const derivedPublicKey = await this.derivePublicKey(privateKey, keyType);

      // Compare if public keys match
      return this.areUint8ArraysEqual(derivedPublicKey, publicKey);
    } catch (error) {
      console.warn('Key pair consistency validation failed:', error);
      return false;
    }
  }

  /**
   * Compare two Uint8Array for equality
   * @param a First array
   * @param b Second array
   * @returns true if arrays are equal, false otherwise
   */
  private static areUint8ArraysEqual(a: Uint8Array, b: Uint8Array): boolean {
    if (a.length !== b.length) return false;
    for (let i = 0; i < a.length; i++) {
      if (a[i] !== b[i]) return false;
    }
    return true;
  }
}
