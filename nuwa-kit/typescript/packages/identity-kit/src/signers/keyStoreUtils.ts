import { KeyStore } from '../keys/KeyStore';
import { KeyType } from '../types/crypto';
import { MultibaseCodec } from '../multibase';
import { CryptoUtils } from '../crypto';

/**
 * Sign data with the given KeyStore. If the KeyStore itself implements a
 * `sign()` method (e.g., for WebAuthn / non-extractable keys), that method
 * is preferred. Otherwise the private key is loaded and the signature is
 * produced via `CryptoUtils.sign()`.
 *
 * @param keyStore  The key store to use
 * @param data      The data to sign
 * @param keyId     Full verificationMethod id (did#fragment)
 */
export async function signWithKeyStore(
  keyStore: KeyStore,
  data: Uint8Array,
  keyId: string
): Promise<Uint8Array> {
  if (typeof (keyStore as any).sign === 'function') {
    // KeyStore 自带原子签名（例如 WebAuthn）
    return (keyStore as any).sign(keyId, data);
  }

  const key = await keyStore.load(keyId);
  if (!key) {
    throw new Error(`Key not found: ${keyId}`);
  }
  if (!key.privateKeyMultibase) {
    throw new Error(`No private key available for ${keyId}`);
  }

  const privateKeyBytes = MultibaseCodec.decode(key.privateKeyMultibase);
  return CryptoUtils.sign(data, privateKeyBytes, key.keyType);
}

/**
 * Test whether a key can be used for signing in this KeyStore.
 */
export async function canSignWithKeyStore(keyStore: KeyStore, keyId: string): Promise<boolean> {
  if (typeof (keyStore as any).sign === 'function') {
    const keyExists = await keyStore.load(keyId);
    return keyExists !== null;
  }
  const key = await keyStore.load(keyId);
  return !!(key && key.privateKeyMultibase);
}

/**
 * Retrieve public key + type info from the KeyStore.
 */
export async function getKeyInfoFromKeyStore(
  keyStore: KeyStore,
  keyId: string
): Promise<{ type: KeyType; publicKey: Uint8Array } | undefined> {
  const key = await keyStore.load(keyId);
  if (!key) return undefined;
  const publicKeyBytes = MultibaseCodec.decode(key.publicKeyMultibase);
  return { type: key.keyType, publicKey: publicKeyBytes };
}
