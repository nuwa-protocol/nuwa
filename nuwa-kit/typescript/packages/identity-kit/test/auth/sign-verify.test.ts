import { describe, it, expect, beforeEach } from '@jest/globals';
import { DIDAuth } from '../../src';
import { DIDDocument, KEY_TYPE } from '../../src';
import { CryptoUtils } from '../../src/crypto';
import { MultibaseCodec } from '../../src/multibase';
import { KeyManager } from '../../src/keys/KeyManager';
import { VDRRegistry } from '../../src/vdr/VDRRegistry';
import { InMemoryLRUDIDDocumentCache } from '../../src/cache/InMemoryLRUDIDDocumentCache';
import { DIDResolver } from '../../src/types';
import { AuthErrorCode } from '../../src/auth/v1';

// Simple resolver returning static DID Document
class StaticResolver implements DIDResolver {
  constructor(private doc: DIDDocument) {}
  async resolveDID() {
    return this.doc;
  }
}

// Resolver that returns null (simulates DID not found)
class NullResolver implements DIDResolver {
  async resolveDID() {
    return null;
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

describe('DIDAuth.v1 error code tests', () => {
  let goodKeyPair: { publicKey: Uint8Array; privateKey: Uint8Array };
  let did: string;
  let keyId: string;
  let didDoc: DIDDocument;
  let signer: KeyManager;

  beforeEach(async () => {
    goodKeyPair = await CryptoUtils.generateKeyPair(KEY_TYPE.ED25519);
    did = 'did:key:test-errors';
    keyId = `${did}#key-1`;
    didDoc = buildDidDoc(goodKeyPair.publicKey, did, keyId);

    const { keyManager } = await KeyManager.createWithKeyPair(
      did,
      { privateKey: goodKeyPair.privateKey, publicKey: goodKeyPair.publicKey },
      'key-1',
      KEY_TYPE.ED25519
    );
    signer = keyManager;
  });

  it('returns INVALID_HEADER error for malformed authorization header', async () => {
    const resolver = new StaticResolver(didDoc);

    // Test empty header
    let result = await DIDAuth.v1.verifyAuthHeader('', resolver);
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.errorCode).toBe(AuthErrorCode.INVALID_HEADER);
      expect(result.signedObject).toBeUndefined();
    }

    // Test invalid scheme
    result = await DIDAuth.v1.verifyAuthHeader('Bearer invalid', resolver);
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.errorCode).toBe(AuthErrorCode.INVALID_HEADER);
      expect(result.signedObject).toBeUndefined();
    }
  });

  it('returns INVALID_BASE64 error for invalid base64 encoding', async () => {
    const resolver = new StaticResolver(didDoc);

    const result = await DIDAuth.v1.verifyAuthHeader('DIDAuthV1 invalid-base64!@#', resolver);
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.errorCode).toBe(AuthErrorCode.INVALID_BASE64);
      expect(result.signedObject).toBeUndefined();
    }
  });

  it('returns INVALID_JSON error for malformed JSON payload', async () => {
    const resolver = new StaticResolver(didDoc);

    // Create invalid JSON as base64
    const invalidJson = 'invalid json content {';
    const b64url = MultibaseCodec.encodeBase64url(invalidJson);

    const result = await DIDAuth.v1.verifyAuthHeader(`DIDAuthV1 ${b64url}`, resolver);
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.errorCode).toBe(AuthErrorCode.INVALID_JSON);
      expect(result.signedObject).toBeUndefined();
    }
  });

  it('returns MISSING_SIGNATURE error for payload without signature', async () => {
    const resolver = new StaticResolver(didDoc);

    // Create JSON without signature
    const invalidPayload = JSON.stringify({
      signed_data: { operation: 'test', timestamp: Date.now(), nonce: 'test' },
      // missing signature field
    });
    const b64url = MultibaseCodec.encodeBase64url(invalidPayload);

    const result = await DIDAuth.v1.verifyAuthHeader(`DIDAuthV1 ${b64url}`, resolver);
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.errorCode).toBe(AuthErrorCode.MISSING_SIGNATURE);
      expect(result.signedObject).toBeUndefined();
    }
  });

  it('returns TIMESTAMP_OUT_OF_WINDOW error for expired signatures', async () => {
    const resolver = new StaticResolver(didDoc);

    const payload = { operation: 'test-expired', params: {} };

    // Create signature with timestamp far in the past
    const expiredTimestamp = Math.floor(Date.now() / 1000) - 3600; // 1 hour ago
    const sigObj = await DIDAuth.v1.createSignature(payload, signer, keyId, {
      timestamp: expiredTimestamp,
    });

    const header = DIDAuth.v1.toAuthorizationHeader(sigObj);
    const result = await DIDAuth.v1.verifyAuthHeader(header, resolver);

    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.errorCode).toBe(AuthErrorCode.TIMESTAMP_OUT_OF_WINDOW);
      expect(result.signedObject).toBeDefined();
      expect(result.signedObject?.signed_data.timestamp).toBe(expiredTimestamp);
    }
  });

  it('returns NONCE_REPLAYED error for duplicate nonces', async () => {
    const resolver = new StaticResolver(didDoc);

    const payload = { operation: 'test-nonce', params: {} };
    const fixedNonce = 'fixed-nonce-for-testing';

    // Create first signature with fixed nonce
    const sigObj1 = await DIDAuth.v1.createSignature(payload, signer, keyId, {
      nonce: fixedNonce,
    });

    // First verification should succeed
    const header1 = DIDAuth.v1.toAuthorizationHeader(sigObj1);
    const result1 = await DIDAuth.v1.verifyAuthHeader(header1, resolver);
    expect(result1.ok).toBe(true);

    // Create second signature with same nonce
    const sigObj2 = await DIDAuth.v1.createSignature(payload, signer, keyId, {
      nonce: fixedNonce,
    });

    // Second verification should fail with nonce replay error
    const header2 = DIDAuth.v1.toAuthorizationHeader(sigObj2);
    const result2 = await DIDAuth.v1.verifyAuthHeader(header2, resolver);

    expect(result2.ok).toBe(false);
    if (!result2.ok) {
      expect(result2.errorCode).toBe(AuthErrorCode.NONCE_REPLAYED);
      expect(result2.signedObject).toBeDefined();
      expect(result2.signedObject?.signed_data.nonce).toBe(fixedNonce);
    }
  });

  it('returns DID_DOCUMENT_NOT_FOUND error when DID cannot be resolved', async () => {
    const nullResolver = new NullResolver();

    const payload = { operation: 'test-no-did', params: {} };
    const sigObj = await DIDAuth.v1.createSignature(payload, signer, keyId);

    const header = DIDAuth.v1.toAuthorizationHeader(sigObj);
    const result = await DIDAuth.v1.verifyAuthHeader(header, nullResolver);

    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.errorCode).toBe(AuthErrorCode.DID_DOCUMENT_NOT_FOUND);
      expect(result.signedObject).toBeDefined();
    }
  });

  it('returns DID_MISMATCH error when DID document ID does not match signer', async () => {
    // Create DID document with different ID
    const wrongDid = 'did:key:wrong-did';
    const wrongDidDoc = buildDidDoc(goodKeyPair.publicKey, wrongDid, keyId);
    const resolver = new StaticResolver(wrongDidDoc);

    const payload = { operation: 'test-did-mismatch', params: {} };
    const sigObj = await DIDAuth.v1.createSignature(payload, signer, keyId);

    const header = DIDAuth.v1.toAuthorizationHeader(sigObj);
    const result = await DIDAuth.v1.verifyAuthHeader(header, resolver);

    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.errorCode).toBe(AuthErrorCode.DID_MISMATCH);
      expect(result.signedObject).toBeDefined();
    }
  });

  it('returns VERIFICATION_METHOD_NOT_FOUND error when key ID is not in DID document', async () => {
    // Create DID document without the required verification method
    const didDocWithoutKey: DIDDocument = {
      '@context': 'https://www.w3.org/ns/did/v1',
      id: did,
      verificationMethod: [], // Empty verification methods
      authentication: [],
    };
    const resolver = new StaticResolver(didDocWithoutKey);

    const payload = { operation: 'test-no-key', params: {} };
    const sigObj = await DIDAuth.v1.createSignature(payload, signer, keyId);

    const header = DIDAuth.v1.toAuthorizationHeader(sigObj);
    const result = await DIDAuth.v1.verifyAuthHeader(header, resolver);

    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.errorCode).toBe(AuthErrorCode.VERIFICATION_METHOD_NOT_FOUND);
      expect(result.signedObject).toBeDefined();
    }
  });

  it('returns INVALID_PUBLIC_KEY error when verification method has no public key', async () => {
    // Create DID document with verification method but no public key
    const didDocWithBadKey: DIDDocument = {
      '@context': 'https://www.w3.org/ns/did/v1',
      id: did,
      verificationMethod: [
        {
          id: keyId,
          type: 'Ed25519VerificationKey2020',
          controller: did,
          // Missing publicKeyMultibase and publicKeyJwk
        },
      ],
      authentication: [keyId],
    };
    const resolver = new StaticResolver(didDocWithBadKey);

    const payload = { operation: 'test-no-pubkey', params: {} };
    const sigObj = await DIDAuth.v1.createSignature(payload, signer, keyId);

    const header = DIDAuth.v1.toAuthorizationHeader(sigObj);
    const result = await DIDAuth.v1.verifyAuthHeader(header, resolver);

    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.errorCode).toBe(AuthErrorCode.INVALID_PUBLIC_KEY);
      expect(result.signedObject).toBeDefined();
    }
  });

  it('returns SIGNATURE_VERIFICATION_FAILED error when signature is invalid', async () => {
    // Create signature with wrong key
    const wrongKeyPair = await CryptoUtils.generateKeyPair(KEY_TYPE.ED25519);
    const wrongDidDoc = buildDidDoc(wrongKeyPair.publicKey, did, keyId);
    const resolver = new StaticResolver(wrongDidDoc);

    const payload = { operation: 'test-wrong-signature', params: {} };
    // Sign with original key but verify against wrong public key
    const sigObj = await DIDAuth.v1.createSignature(payload, signer, keyId);

    const header = DIDAuth.v1.toAuthorizationHeader(sigObj);
    const result = await DIDAuth.v1.verifyAuthHeader(header, resolver);

    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.errorCode).toBe(AuthErrorCode.SIGNATURE_VERIFICATION_FAILED);
      expect(result.signedObject).toBeDefined();
    }
  });

  it('provides signedObject in all verification failure cases (except header parsing errors)', async () => {
    const resolver = new StaticResolver(didDoc);

    const payload = { operation: 'test-signed-object', params: {} };
    const expiredTimestamp = Math.floor(Date.now() / 1000) - 3600;
    const sigObj = await DIDAuth.v1.createSignature(payload, signer, keyId, {
      timestamp: expiredTimestamp,
    });

    const header = DIDAuth.v1.toAuthorizationHeader(sigObj);
    const result = await DIDAuth.v1.verifyAuthHeader(header, resolver);

    // Should fail but provide signedObject for context
    expect(result.ok).toBe(false);
    expect(result.signedObject).toBeDefined();
    expect(result.signedObject?.signature.signer_did).toBe(did);
    expect(result.signedObject?.signature.key_id).toBe(keyId);
    expect(result.signedObject?.signed_data.operation).toBe('test-signed-object');
  });
});
