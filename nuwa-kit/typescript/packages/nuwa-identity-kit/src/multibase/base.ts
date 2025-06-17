import { base58btc } from 'multiformats/bases/base58';
import { base64pad } from 'multiformats/bases/base64';

/**
 * Base multibase codec implementation
 * Provides basic encoding/decoding functionality without key type awareness
 */
export class BaseMultibaseCodec {
  /**
   * Encode bytes to base58btc format
   * @param bytes The bytes to encode
   * @returns base58btc encoded string with 'z' prefix
   */
  static encodeBase58btc(bytes: Uint8Array): string {
    return base58btc.encode(bytes);
  }

  /**
   * Encode bytes to base64pad format
   * @param bytes The bytes to encode
   * @returns base64pad encoded string with 'M' prefix
   */
  static encodeBase64pad(bytes: Uint8Array): string {
    return base64pad.encode(bytes);
  }

  /**
   * Encode bytes to base16 (hex) format
   * @param bytes The bytes to encode
   * @returns base16 encoded string with 'f' prefix
   */
  static encodeBase16(bytes: Uint8Array): string {
    return (
      'f' +
      Array.from(bytes)
        .map(b => b.toString(16).padStart(2, '0'))
        .join('')
    );
  }

  /**
   * Decode base58btc string to bytes
   * @param encoded The base58btc encoded string
   * @returns decoded bytes
   */
  static decodeBase58btc(encoded: string): Uint8Array {
    try {
      return base58btc.decode(encoded);
    } catch (error) {
      throw new Error(`Invalid multibase format ${encoded}, error: ${error}`);
    }
  }

  /**
   * Decode base64pad string to bytes
   * @param encoded The base64pad encoded string
   * @returns decoded bytes
   */
  static decodeBase64pad(encoded: string): Uint8Array {
    try {
      return base64pad.decode(encoded);
    } catch (error) {
      throw new Error('Invalid multibase format');
    }
  }

  /**
   * Decode base16 string to bytes
   * @param encoded The base16 encoded string
   * @returns decoded bytes
   */
  static decodeBase16(encoded: string): Uint8Array {
    try {
      // Remove 'f' prefix if present
      const hex = encoded.startsWith('f') ? encoded.slice(1) : encoded;
      // Validate hex string
      if (!hex.match(/^[0-9a-fA-F]*$/)) {
        throw new Error('Invalid hex string');
      }
      // Convert hex string to byte array
      const bytes = new Uint8Array(hex.length / 2);
      for (let i = 0; i < hex.length; i += 2) {
        bytes[i / 2] = parseInt(hex.slice(i, i + 2), 16);
      }
      return bytes;
    } catch (error) {
      throw new Error('Invalid multibase format');
    }
  }
}
