import { KeyType } from '../types/crypto';
import { MultibaseCodec } from './base';
import { KeyMultibaseCodec } from './key';

/**
 * DID key codec implementation
 * Handles encoding/decoding of did:key identifiers
 */
export class DidKeyCodec {
  /**
   * Generate did:key from public key
   * @param publicKey The public key bytes
   * @param keyType The key type
   * @returns did:key identifier
   */
  static generateDidKey(publicKey: Uint8Array, keyType: KeyType): string {
    // KeyMultibaseCodec.encodeWithType will validate key length
    const multibase = KeyMultibaseCodec.encodeWithType(publicKey, keyType);
    return `did:key:${multibase}`;
  }

  /**
   * Parse did:key to get key type and public key
   * @param didKey The did:key identifier
   * @returns The key type and public key bytes
   */
  static parseDidKey(didKey: string): { keyType: KeyType; publicKey: Uint8Array } {
    if (!didKey.startsWith('did:key:')) {
      throw new Error('Invalid did:key format');
    }
    const multibase = didKey.substring(8);
    const { keyType, bytes } = KeyMultibaseCodec.decodeWithType(multibase);
    return { keyType, publicKey: bytes };
  }
}
