import { describe, it, expect } from '@jest/globals';
import { DIDAuth } from '../../src';
import { DIDDocument, KEY_TYPE } from '../../src';
import { CryptoUtils } from '../../src/crypto';
import { MultibaseCodec } from '../../src/multibase';
import { KeyManager } from '../../src/keys/KeyManager';
import { VDRRegistry } from '../../src/vdr/VDRRegistry';
import { InMemoryLRUDIDDocumentCache } from '../../src/cache/InMemoryLRUDIDDocumentCache';
import { DIDResolver } from '../../src/types';

// Simple resolver returning static DID Document
class StaticResolver implements DIDResolver {
  constructor(private doc: DIDDocument) {}
  async resolveDID() {
    return this.doc;
  }
}

function buildDidDoc(pubKey: Uint8Array, did: string, keyId: string): DIDDocument {
  return {
    '@context': 'https://www.w3.org/ns/did/v1',
    id: did,
    verificationMethod: [
      {
        id: keyId,
        type: 'Ed25519VerificationKey2020',
        controller: did,
        publicKeyMultibase: MultibaseCodec.encodeBase58btc(pubKey),
      },
    ],
    authentication: [keyId],
  };
}

describe('DIDAuth.v1 basic sign/verify', () => {
  it('signs and verifies a payload', async () => {
    // generate key pair
    const { publicKey, privateKey } = await CryptoUtils.generateKeyPair(KEY_TYPE.ED25519);
    const did = 'did:key:test';
    const keyId = `${did}#key-1`;
    const didDoc = buildDidDoc(publicKey, did, keyId);

    const { keyManager: signer } = await KeyManager.createWithKeyPair(
      did,
      { privateKey, publicKey },
      'key-1',
      KEY_TYPE.ED25519
    );
    const resolver = new StaticResolver(didDoc);

    const payload = {
      operation: 'unit-test',
      params: { foo: 'bar' },
    } as const;

    const sigObj = await DIDAuth.v1.createSignature(payload, signer, keyId);
    const ok = await DIDAuth.v1.verifySignature(sigObj, resolver);
    expect(ok).toBe(true);

    // header round-trip
    const header = DIDAuth.v1.toAuthorizationHeader(sigObj);
    const result = await DIDAuth.v1.verifyAuthHeader(header, resolver);
    expect(result.ok).toBe(true);
  });

  // TODO: add forceRefresh behaviour test once resolver implements caching.

  it('resolves via forceRefresh when cached DID Document is stale', async () => {
    // good key (used for signing & valid doc)
    const goodKeyPair = await CryptoUtils.generateKeyPair(KEY_TYPE.ED25519);
    const did = 'did:key:test-refresh';
    const keyId = `${did}#key-1`;
    const didDocGood = buildDidDoc(goodKeyPair.publicKey, did, keyId);

    // bad key (stale doc in cache)
    const badKeyPair = await CryptoUtils.generateKeyPair(KEY_TYPE.ED25519);
    const didDocBad = buildDidDoc(badKeyPair.publicKey, did, keyId);

    // signer with good key
    const { keyManager: signer } = await KeyManager.createWithKeyPair(
      did,
      { privateKey: goodKeyPair.privateKey, publicKey: goodKeyPair.publicKey },
      'key-1',
      KEY_TYPE.ED25519
    );

    // VDR that returns stale doc first, fresh doc second
    let resolveCount = 0;
    const docs = [didDocBad, didDocGood];

    const togglingVDR: any = {
      getMethod: () => 'key',
      resolve: async (_did: string) => {
        const doc = docs[Math.min(resolveCount, docs.length - 1)];
        resolveCount += 1;
        return doc;
      },
      exists: async () => true,
      create: async () => ({ success: false }),
      createViaCADOP: async () => ({ success: false }),
      addVerificationMethod: async () => false,
      removeVerificationMethod: async () => false,
      addService: async () => false,
      removeService: async () => false,
      updateRelationships: async () => false,
      updateController: async () => false,
    } as any;

    const registry = VDRRegistry.getInstance();
    registry.setCache(new InMemoryLRUDIDDocumentCache());
    registry.registerVDR(togglingVDR);

    const payload = {
      operation: 'unit-test-refresh',
      params: { foo: 'bar' },
    } as const;

    const sigObj = await DIDAuth.v1.createSignature(payload, signer, keyId);

    const ok = await DIDAuth.v1.verifySignature(sigObj, registry);
    expect(ok).toBe(true);
    expect(resolveCount).toBe(2); // first stale, second (forceRefresh) fresh
  });
});
