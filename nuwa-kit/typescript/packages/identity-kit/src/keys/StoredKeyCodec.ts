import { StoredKey } from './KeyStore';
import { MultibaseCodec } from '../multibase';

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
    const jsonBytes = new TextEncoder().encode(json);
    return MultibaseCodec.encodeBase58btc(jsonBytes);
  }

  /**
   * Decode a multibase string to a StoredKey
   * @param serialized The multibase encoded string
   * @returns The decoded StoredKey
   */
  static decode(serialized: string): StoredKey {
    const jsonBytes = MultibaseCodec.decode(serialized);
    const jsonStr = new TextDecoder().decode(jsonBytes);
    return JSON.parse(jsonStr) as StoredKey;
  }
} 