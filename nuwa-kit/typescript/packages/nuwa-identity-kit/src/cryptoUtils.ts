import { base58btc } from 'multiformats/bases/base58';
import { base64urlpad } from 'multiformats/bases/base64';
import { KEY_TYPE, KeyType, KeyTypeInput, toKeyType } from './types';
import { defaultCryptoProviderFactory } from './crypto/factory';

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
  static async generateKeyPair(type: KeyTypeInput = KEY_TYPE.ED25519): Promise<{ publicKey: Uint8Array; privateKey: Uint8Array }> {
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
    
    // Add multicodec prefix based on key type
    const prefix = keyType === KEY_TYPE.ED25519 ? new Uint8Array([0xed, 0x01]) : new Uint8Array([0xe7, 0x01]);
    const prefixedKey = new Uint8Array(prefix.length + publicKey.length);
    prefixedKey.set(prefix);
    prefixedKey.set(publicKey, prefix.length);
    
    // Encode with base58btc
    return base58btc.encode(prefixedKey);
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
      default:
        throw new Error(`Unsupported curve: ${jwk.crv}`);
    }

    // Convert base64url-encoded x coordinate to Uint8Array
    const publicKeyBytes = base64urlpad.decode(jwk.x);
    
    // Use existing publicKeyToMultibase method to handle the conversion
    return CryptoUtils.publicKeyToMultibase(publicKeyBytes, keyType);
  }

  /**
   * Signs data using the specified private key
   * @param data The data to sign
   * @param privateKey The private key to use for signing (can be Uint8Array or CryptoKey)
   * @param type The key type (Ed25519VerificationKey2020 or EcdsaSecp256k1VerificationKey2019)
   * @returns The signature as a base64url-encoded string
   */
  static async sign(data: Uint8Array, privateKey: Uint8Array | CryptoKey, type: KeyTypeInput): Promise<string> {
    const keyType = typeof type === 'string' ? toKeyType(type) : type;
    const provider = defaultCryptoProviderFactory.createProvider(keyType);
    const signature = await provider.sign(data, privateKey);
    return base64urlpad.encode(signature);
  }

  /**
   * Verifies a signature using the specified public key
   * @param data The original data
   * @param signature The signature to verify (base64url-encoded)
   * @param publicKey The public key to use for verification (can be Uint8Array or JsonWebKey)
   * @param type The key type (Ed25519VerificationKey2020 or EcdsaSecp256k1VerificationKey2019)
   * @returns Whether the signature is valid
   */
  static async verify(data: Uint8Array, signature: string, publicKey: Uint8Array | JsonWebKey, type: KeyTypeInput): Promise<boolean> {
    const keyType = typeof type === 'string' ? toKeyType(type) : type;
    const provider = defaultCryptoProviderFactory.createProvider(keyType);
    const signatureBytes = base64urlpad.decode(signature);
    return provider.verify(data, signatureBytes, publicKey);
  }
}
