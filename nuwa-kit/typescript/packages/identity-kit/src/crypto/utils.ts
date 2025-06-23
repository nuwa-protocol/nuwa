import { base64urlpad } from 'multiformats/bases/base64';
import { KEY_TYPE, KeyType, KeyTypeInput, toKeyType } from '../types';
import { defaultCryptoProviderFactory } from './factory';
import { KeyMultibaseCodec } from '../multibase';

/**
 * CryptoUtils provides cross-platform cryptographic utilities for DID operations.
 * It abstracts the complexity of different key types and formats.
 */
export class CryptoUtils {
  /**
   * Generates a key pair based on the specified curve
   * @param type The key type to generate (Ed25519VerificationKey2020 or EcdsaSecp256k1VerificationKey2019)
   * @returns A key pair containing public and private keys
   */
  static async generateKeyPair(
    type: KeyTypeInput = KEY_TYPE.ED25519
  ): Promise<{ publicKey: Uint8Array; privateKey: Uint8Array }> {
    const keyType = typeof type === 'string' ? toKeyType(type) : type;
    const provider = defaultCryptoProviderFactory.createProvider(keyType);
    return provider.generateKeyPair();
  }

  /**
   * Converts a public key to multibase format
   * @param publicKey The public key to convert
   * @param type The key type (Ed25519VerificationKey2020 or EcdsaSecp256k1VerificationKey2019)
   * @returns The multibase-encoded public key
   */
  static publicKeyToMultibase(publicKey: Uint8Array, type: KeyTypeInput): string {
    const keyType = typeof type === 'string' ? toKeyType(type) : type;
    return KeyMultibaseCodec.encodeWithType(publicKey, keyType);
  }

  static multibaseToPublicKey(multibase: string): { keyType: KeyType; publicKey: Uint8Array } {
    const { keyType, bytes } = KeyMultibaseCodec.decodeWithType(multibase);
    return { keyType, publicKey: bytes };
  }

  static jwkToMultibase(jwk: JsonWebKey): string {
    if (!jwk.x || !jwk.kty || !jwk.crv) {
      throw new Error('Invalid JWK: missing required properties');
    }

    let keyType: KeyType;
    // Determine key type based on JWK curve
    switch (jwk.crv) {
      case 'Ed25519':
        keyType = KEY_TYPE.ED25519;
        break;
      case 'secp256k1':
        keyType = KEY_TYPE.SECP256K1;
        break;
      case 'P-256':
        keyType = KEY_TYPE.ECDSAR1;
        break;
      default:
        throw new Error(`Unsupported curve: ${jwk.crv}`);
    }

    // Convert base64url-encoded x coordinate to Uint8Array
    const publicKeyBytes = base64urlpad.decode(jwk.x);

    // Use KeyMultibaseCodec to handle the conversion
    return KeyMultibaseCodec.encodeWithType(publicKeyBytes, keyType);
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
