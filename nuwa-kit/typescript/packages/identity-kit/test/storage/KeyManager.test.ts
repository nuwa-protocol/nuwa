import { describe, expect, it, beforeEach } from '@jest/globals';
import { KeyManager, MemoryKeyStore, StoredKey } from '../../src/keys';
import { KEY_TYPE } from '../../src/types';
import { BaseMultibaseCodec } from '../../src/multibase';

describe('KeyManager', () => {
  const TEST_DID = 'did:example:123';
  let keyManager: KeyManager;

  beforeEach(() => {
    // Create a fresh KeyManager with a MemoryKeyStore for each test
    keyManager = new KeyManager({
      did: TEST_DID,
      defaultKeyType: KEY_TYPE.ED25519,
    });
  });

  it('should be initialized with correct default values', async () => {
    expect(await keyManager.getDid()).toBe(TEST_DID);
    expect(keyManager.getStore()).toBeInstanceOf(MemoryKeyStore);
  });

  it('should generate a key with the default key type', async () => {
    const key = await keyManager.generateKey('test-key');

    expect(key.keyId).toBe(`${TEST_DID}#test-key`);
    expect(key.keyType).toBe(KEY_TYPE.ED25519);
    expect(key.publicKeyMultibase).toBeDefined();
    expect(key.privateKeyMultibase).toBeDefined();
  });

  it('should generate a key with a specified key type', async () => {
    const key = await keyManager.generateKey('secp-key', KEY_TYPE.SECP256K1);

    expect(key.keyId).toBe(`${TEST_DID}#secp-key`);
    expect(key.keyType).toBe(KEY_TYPE.SECP256K1);
  });

  it('should list generated keys', async () => {
    await keyManager.generateKey('key1');
    await keyManager.generateKey('key2');

    const keys = await keyManager.listKeyIds();

    expect(keys).toHaveLength(2);
    expect(keys).toContain(`${TEST_DID}#key1`);
    expect(keys).toContain(`${TEST_DID}#key2`);
  });

  it('should retrieve a stored key', async () => {
    const generatedKey = await keyManager.generateKey('retrieve-key');
    const retrievedKey = await keyManager.getStoredKey(generatedKey.keyId);

    expect(retrievedKey).toEqual(generatedKey);
  });

  it('should delete a key', async () => {
    const key = await keyManager.generateKey('delete-key');

    // Verify key exists
    let keys = await keyManager.listKeyIds();
    expect(keys).toContain(key.keyId);

    // Delete the key
    await keyManager.deleteKey(key.keyId);

    // Verify key is gone
    keys = await keyManager.listKeyIds();
    expect(keys).not.toContain(key.keyId);

    // Verify key cannot be loaded
    const retrievedKey = await keyManager.getStoredKey(key.keyId);
    expect(retrievedKey).toBeNull();
  });

  it('should import an existing key', async () => {
    const storedKey: StoredKey = {
      keyId: `${TEST_DID}#imported-key`,
      keyType: KEY_TYPE.ED25519,
      publicKeyMultibase: 'z6MkhaXgBZDvotDkL5257faiztiGiC2QtKLGpbnnEGta2doK', // Example encoded public key
      privateKeyMultibase: 'z6MkhaXgBZDvotDkL5257faiztiGiC2QtKLGpbnnEGta2doK', // Example encoded private key
    };

    await keyManager.importKey(storedKey);

    const keys = await keyManager.listKeyIds();
    expect(keys).toContain(storedKey.keyId);

    const retrievedKey = await keyManager.getStoredKey(storedKey.keyId);
    expect(retrievedKey).toEqual(storedKey);
  });

  it('should sign data with a key', async () => {
    const key = await keyManager.generateKey('signing-key');
    const data = new TextEncoder().encode('test data');

    const signature = await keyManager.signWithKeyId(data, key.keyId);

    expect(signature).toBeInstanceOf(Uint8Array);
    expect(signature.length).toBeGreaterThan(0);
  });

  it('should check if a key can sign', async () => {
    const key = await keyManager.generateKey('can-sign-key');

    const canSign = await keyManager.canSignWithKeyId(key.keyId);
    expect(canSign).toBe(true);

    const canSignNonExistent = await keyManager.canSignWithKeyId('non-existent-key');
    expect(canSignNonExistent).toBe(false);
  });

  it('should get key info', async () => {
    const key = await keyManager.generateKey('info-key');

    const keyInfo = await keyManager.getKeyInfo(key.keyId);

    expect(keyInfo).toBeDefined();
    expect(keyInfo?.type).toBe(key.keyType);
    expect(keyInfo?.publicKey).toBeInstanceOf(Uint8Array);
  });

  it('should find a key by type', async () => {
    await keyManager.generateKey('ed-key', KEY_TYPE.ED25519);
    await keyManager.generateKey('secp-key', KEY_TYPE.SECP256K1);

    const edKeyId = await keyManager.findKeyByType(KEY_TYPE.ED25519);
    const secpKeyId = await keyManager.findKeyByType(KEY_TYPE.SECP256K1);

    expect(edKeyId).toBe(`${TEST_DID}#ed-key`);
    expect(secpKeyId).toBe(`${TEST_DID}#secp-key`);
  });

  it('should throw an error when generating a key without a DID', async () => {
    const managerWithoutDid = new KeyManager();

    await expect(managerWithoutDid.generateKey('test-key')).rejects.toThrow();
  });

  it('should adopt the DID from an imported key when no DID is set', async () => {
    const managerWithoutDid = new KeyManager();

    const storedKey: StoredKey = {
      keyId: `${TEST_DID}#adopt-key`,
      keyType: KEY_TYPE.ED25519,
      publicKeyMultibase: 'z6MkhaXgBZDvotDkL5257faiztiGiC2QtKLGpbnnEGta2doK',
      privateKeyMultibase: 'z6MkhaXgBZDvotDkL5257faiztiGiC2QtKLGpbnnEGta2doK',
    };

    await managerWithoutDid.importKey(storedKey);

    expect(await managerWithoutDid.getDid()).toBe(TEST_DID);
  });

  it('should reject a key from a different DID', async () => {
    const differentDid = 'did:example:456';

    const storedKey: StoredKey = {
      keyId: `${differentDid}#different-key`,
      keyType: KEY_TYPE.ED25519,
      publicKeyMultibase: 'z6MkhaXgBZDvotDkL5257faiztiGiC2QtKLGpbnnEGta2doK',
      privateKeyMultibase: 'z6MkhaXgBZDvotDkL5257faiztiGiC2QtKLGpbnnEGta2doK',
    };

    await expect(keyManager.importKey(storedKey)).rejects.toThrow();
  });
});
