import { StoredKey } from './KeyStore';
import { MultibaseCodec } from '../multibase';
import { CryptoUtils } from '../crypto/utils';
import { stringToBytes, bytesToString } from '../utils/bytes';

/**
 * Codec for serializing and deserializing StoredKey objects
 * Uses base58btc multibase encoding (z prefix) for string representation
 */
export class StoredKeyCodec {
  /**
   * Encode a StoredKey to a base58btc multibase string
   * @param key The StoredKey to encode
   * @returns base58btc encoded string with 'z' prefix
   */
  static encode(key: StoredKey): string {
    const json = JSON.stringify(key);
    const jsonBytes = stringToBytes(json);
    return MultibaseCodec.encodeBase58btc(jsonBytes);
  }

  /**
   * Decode a multibase string to a StoredKey with automatic key consistency validation
   * @param serialized The multibase encoded string
   * @returns The decoded and validated StoredKey
   * @throws Error if decoding fails or key validation fails
   */
  static async decode(serialized: string): Promise<StoredKey> {
    const jsonBytes = MultibaseCodec.decode(serialized);
    const jsonStr = bytesToString(jsonBytes);
    const key = JSON.parse(jsonStr) as StoredKey;

    // Automatically validate key consistency for security
    const isValid = await this.validateKeyConsistency(key);
    if (!isValid) {
      throw new Error('StoredKey validation failed: private and public keys are inconsistent');
    }

    return key;
  }

  /**
   * Validate the consistency between private key and public key in StoredKey
   * @param key The StoredKey to validate
   * @returns true if keys are consistent or validation can be skipped, false otherwise
   */
  private static async validateKeyConsistency(key: StoredKey): Promise<boolean> {
    if (
      !key.privateKeyMultibase ||
      !key.publicKeyMultibase ||
      key.privateKeyMultibase.trim() === '' ||
      key.publicKeyMultibase.trim() === ''
    ) {
      // Skip validation if either key is missing or empty
      return true;
    }

    try {
      // Decode private and public keys
      const privateKeyBytes = MultibaseCodec.decode(key.privateKeyMultibase);
      const publicKeyBytes = MultibaseCodec.decode(key.publicKeyMultibase);

      // Use the centralized validation method from CryptoUtils
      return await CryptoUtils.validateKeyPairConsistency(
        privateKeyBytes,
        publicKeyBytes,
        key.keyType
      );
    } catch (error) {
      console.warn('Key consistency validation failed:', error);
      return false;
    }
  }
}
