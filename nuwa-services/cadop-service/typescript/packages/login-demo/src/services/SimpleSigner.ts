import type { SignerInterface, KeyType } from '@nuwa-ai/identity-kit';
import { CryptoUtils, KEY_TYPE } from '@nuwa-ai/identity-kit';

/**
 * Minimal in-memory signer used for demo/debug. *NOT* secure for production.
 */
export class SimpleSigner implements SignerInterface {
  private did: string;
  private keyId: string;
  private privateKey: Uint8Array;

  constructor(did: string, keyId: string, privateKey: Uint8Array) {
    this.did = did;
    this.keyId = keyId;
    this.privateKey = privateKey;
  }

  async listKeyIds(): Promise<string[]> {
    return [this.keyId];
  }

  async signWithKeyId(data: Uint8Array, keyId: string): Promise<Uint8Array> {
    if (keyId !== this.keyId) {
      throw new Error(`Key ID ${keyId} not found`);
    }
    return CryptoUtils.sign(data, this.privateKey, KEY_TYPE.ED25519);
  }

  async canSignWithKeyId(keyId: string): Promise<boolean> {
    return keyId === this.keyId;
  }

  getDid(): string {
    return this.did;
  }

  async getKeyInfo(keyId: string): Promise<{ type: KeyType; publicKey: Uint8Array } | undefined> {
    if (keyId !== this.keyId) return undefined;
    return {
      type: KEY_TYPE.ED25519,
      publicKey: new Uint8Array(32), // placeholder – real demo not needed
    };
  }
} 