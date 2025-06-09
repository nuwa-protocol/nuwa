import * as crypto from 'crypto';
import { DIDKeyManager } from '@cadop/shared';

export function generateRandomDid(): string {
  return DIDKeyManager.generateDIDFromEd25519PublicKey(crypto.randomBytes(32).buffer);
}