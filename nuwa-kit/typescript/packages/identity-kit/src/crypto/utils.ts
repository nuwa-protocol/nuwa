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
}
