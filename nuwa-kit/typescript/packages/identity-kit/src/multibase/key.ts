import { KeyType, KEY_TYPE } from '../types';
import { BaseMultibaseCodec } from './base';

/**
 * Key multibase codec implementation
 * Handles encoding/decoding of cryptographic keys with type information
 */
export class KeyMultibaseCodec {
  private static readonly ED25519_PREFIX = new Uint8Array([0xed, 0x01]);
  private static readonly SECP256K1_PREFIX = new Uint8Array([0xe7, 0x01]);
  private static readonly ECDSA_R1_PREFIX = new Uint8Array([0x12, 0x00]);
  private static readonly ED25519_KEY_LENGTH = 32;
  private static readonly SECP256K1_KEY_LENGTH = 33;
  private static readonly ECDSA_R1_KEY_LENGTH = 33;

  /**
   * Encode public key with multicodec prefix
   * @param bytes The public key bytes
   * @param keyType The key type
   * @returns multibase encoded string
   */
  static encodeWithType(bytes: Uint8Array, keyType: KeyType): string {
    // Validate key length
    const expectedLength = this.getExpectedKeyLength(keyType);
    if (bytes.length !== expectedLength) {
      throw new Error(
        `Invalid key length for ${keyType}. Expected ${expectedLength} bytes, got ${bytes.length}`
      );
    }

    const prefix = this.getMulticodecPrefix(keyType);
    const prefixedKey = this.concatenateBytes(prefix, bytes);
    return BaseMultibaseCodec.encodeBase58btc(prefixedKey);
  }

  /**
   * Decode multibase encoded key
   * @param encoded The multibase encoded string
   * @returns The key type and public key bytes
   */
  static decodeWithType(encoded: string): { keyType: KeyType; bytes: Uint8Array } {
    try {
      const decoded = BaseMultibaseCodec.decodeBase58btc(encoded);
      if (decoded.length < 2) {
        throw new Error('Invalid key format: too short');
      }

      const keyType = this.extractKeyType(decoded);
      const bytes = this.extractBytes(decoded);

      // Validate key length
      const expectedLength = this.getExpectedKeyLength(keyType);
      if (bytes.length !== expectedLength) {
        throw new Error(
          `Invalid key length for ${keyType}. Expected ${expectedLength} bytes, got ${bytes.length}`
        );
      }

      return { keyType, bytes };
    } catch (error) {
      if (error instanceof Error && error.message === 'Non-base58btc character') {
        throw new Error('Invalid multibase format');
      }
      throw error;
    }
  }

  private static getMulticodecPrefix(keyType: KeyType): Uint8Array {
    switch (keyType) {
      case KEY_TYPE.ED25519:
        return this.ED25519_PREFIX;
      case KEY_TYPE.SECP256K1:
        return this.SECP256K1_PREFIX;
      case KEY_TYPE.ECDSAR1:
        return this.ECDSA_R1_PREFIX;
      default:
        throw new Error(`Unsupported key type: ${keyType}`);
    }
  }

  private static concatenateBytes(a: Uint8Array, b: Uint8Array): Uint8Array {
    const result = new Uint8Array(a.length + b.length);
    result.set(a);
    result.set(b, a.length);
    return result;
  }

  private static extractKeyType(prefixedBytes: Uint8Array): KeyType {
    if (prefixedBytes[0] === 0xed && prefixedBytes[1] === 0x01) {
      return KEY_TYPE.ED25519;
    } else if (prefixedBytes[0] === 0xe7 && prefixedBytes[1] === 0x01) {
      return KEY_TYPE.SECP256K1;
    } else if (prefixedBytes[0] === 0x12 && prefixedBytes[1] === 0x00) {
      return KEY_TYPE.ECDSAR1;
    }
    throw new Error('Unknown key type prefix');
  }

  private static extractBytes(prefixedBytes: Uint8Array): Uint8Array {
    return prefixedBytes.slice(2);
  }

  private static getExpectedKeyLength(keyType: KeyType): number {
    switch (keyType) {
      case KEY_TYPE.ED25519:
        return this.ED25519_KEY_LENGTH;
      case KEY_TYPE.SECP256K1:
        return this.SECP256K1_KEY_LENGTH;
      case KEY_TYPE.ECDSAR1:
        return this.ECDSA_R1_KEY_LENGTH;
      default:
        throw new Error(`Unsupported key type: ${keyType}`);
    }
  }
}
