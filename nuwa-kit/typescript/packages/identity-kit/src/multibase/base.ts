import { base58btc } from 'multiformats/bases/base58';
import { base64pad, base64, base64url, base64urlpad } from 'multiformats/bases/base64';
import { base16 } from 'multiformats/bases/base16';
import { bytesToString, stringToBytes } from '../utils/bytes';
import { IdentityKitErrorCode, createMultibaseError } from '../errors';

/**
 * Supported multibase names – use these with the generic `encode()` API.
 */
export type MultibaseName =
  | 'base58btc'
  | 'base64pad'
  | 'base64'
  | 'base64url'
  | 'base64urlpad'
  | 'base16';

type MultibaseCodecImpl = {
  encode: (bytes: Uint8Array) => string;
  decode: (encoded: string) => Uint8Array;
};

const ENCODER_MAP: Record<MultibaseName, MultibaseCodecImpl> = {
  base58btc,
  base64pad,
  base64,
  base64url,
  base64urlpad,
  base16,
};

/**
 * Base multibase codec implementation
 * Provides basic encoding/decoding functionality without key type awareness
 */
export class MultibaseCodec {
  /**
   * Generic encode
   * Example: `MultibaseCodec.encode(bytes, 'base64url')`
   */
  static encode(data: Uint8Array | string, base: MultibaseName): string {
    const encoder = ENCODER_MAP[base];
    if (!encoder) {
      throw createMultibaseError(
        IdentityKitErrorCode.MULTIBASE_ENCODE_FAILED,
        `Unsupported multibase: ${base}`,
        { base, supportedBases: Object.keys(ENCODER_MAP) }
      );
    }
    const bytes = typeof data === 'string' ? stringToBytes(data) : data;
    return encoder.encode(bytes);
  }

  /**
   * Encode bytes to base58btc format
   * @param bytes The bytes to encode
   * @returns base58btc encoded string with 'z' prefix
   */
  static encodeBase58btc(bytes: Uint8Array): string {
    return this.encode(bytes, 'base58btc');
  }

  /**
   * Encode bytes to base64pad format
   * @param bytes The bytes to encode
   * @returns base64pad encoded string with 'M' prefix
   */
  static encodeBase64pad(data: Uint8Array | string): string {
    return this.encode(data, 'base64pad');
  }

  /**
   * Encode bytes to base16 (hex) format
   * @param bytes The bytes to encode
   * @returns base16 encoded string with 'f' prefix
   */
  static encodeBase16(bytes: Uint8Array): string {
    return this.encode(bytes, 'base16');
  }

  /**
   * Encode bytes to base64 format
   * @param bytes The bytes to encode
   * @returns base64 encoded string
   */
  static encodeBase64(data: Uint8Array | string): string {
    return this.encode(data, 'base64');
  }

  /**
   * Encode bytes to base64url format (RFC4648 URL-safe, no padding)
   * @param bytes The bytes to encode
   * @returns base64url encoded string with 'u' prefix
   */
  static encodeBase64url(data: Uint8Array | string): string {
    return this.encode(data, 'base64url');
  }

  /**
   * Encode bytes to base64urlpad format (URL-safe with padding)
   * @param bytes The bytes to encode
   * @returns base64urlpad encoded string with 'U' prefix
   */
  static encodeBase64urlpad(data: Uint8Array | string): string {
    return this.encode(data, 'base64urlpad');
  }

  /**
   * Decode base58btc string to bytes
   * @param encoded The base58btc encoded string
   * @returns decoded bytes
   */
  static decodeBase58btc(encoded: string): Uint8Array {
    return base58btc.decode(encoded);
  }

  /**
   * Decode base64pad string to bytes
   * @param encoded The base64pad encoded string
   * @returns decoded bytes
   */
  static decodeBase64pad(encoded: string): Uint8Array {
    return base64pad.decode(encoded);
  }

  /**
   * Decode base16 string to bytes
   * @param encoded The base16 encoded string
   * @returns decoded bytes
   */
  static decodeBase16(encoded: string): Uint8Array {
    return base16.decode(encoded);
  }

  /**
   * Decode base64 string to bytes
   * @param encoded The base64 encoded string
   * @returns decoded bytes
   */
  static decodeBase64(encoded: string): Uint8Array {
    return base64.decode(encoded);
  }

  /**
   * Decode base64url string to bytes
   * @param encoded The base64url encoded string
   * @returns decoded bytes
   */
  static decodeBase64url(encoded: string): Uint8Array {
    return base64url.decode(encoded);
  }

  /**
   * Decode base64url string to string
   * @param encoded The base64url encoded string
   * @returns decoded string
   */
  static decodeBase64urlToString(encoded: string): string {
    return bytesToString(this.decodeBase64url(encoded));
  }

  /**
   * Decode base64urlpad string to bytes
   * @param encoded The base64urlpad encoded string
   * @returns decoded bytes
   */
  static decodeBase64urlpad(encoded: string): Uint8Array {
    return base64urlpad.decode(encoded);
  }

  /**
   * Decode base64urlpad string to string
   * @param encoded The base64urlpad encoded string
   * @returns decoded string
   */
  static decodeBase64urlpadToString(encoded: string): string {
    return bytesToString(this.decodeBase64urlpad(encoded));
  }

  /**
   * Decode multibase encoded string to bytes
   * After multiformats v9, there is no longer a single "universal base" object;
   * the official recommendation is to manually dispatch prefixes between the few *.decoder objects you use.
   * @param encoded The multibase encoded string
   * @returns decoded bytes
   */
  static decode(encoded: string): Uint8Array {
    // Multibase prefix is always the first character
    const prefix = encoded[0];
    switch (prefix) {
      case 'z': // base58btc
        return base58btc.decode(encoded);
      case 'M': // base64pad (RFC4648 with padding)
        return base64pad.decode(encoded);
      case 'f': // base16 (hex, lowercase)
        return base16.decode(encoded);
      case 'm': // base64 (no padding)
        return base64.decode(encoded);
      case 'u': // base64url (no padding)
        return base64url.decode(encoded);
      case 'U': // base64urlpad (with padding)
        return base64urlpad.decode(encoded);
      default:
        throw createMultibaseError(
          IdentityKitErrorCode.MULTIBASE_DECODE_FAILED,
          `Unsupported multibase prefix: ${prefix}`,
          { prefix, supportedPrefixes: ['z', 'M', 'm', 'u', 'U', 'f'] }
        );
    }
  }
}
