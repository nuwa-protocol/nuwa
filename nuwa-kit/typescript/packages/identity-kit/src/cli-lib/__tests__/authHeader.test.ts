import { describe, expect, it } from '@jest/globals';
import { DIDAuth } from '../../auth';
import { CryptoUtils } from '../../crypto';
import { MultibaseCodec } from '../../multibase';
import { KeyType } from '../../types/crypto';
import { createDidAuthHeader } from '../authHeader';
import type { AgentKeyMaterial } from '../types';

describe('createDidAuthHeader', () => {
  it('creates a header that can be verified by DIDAuth', async () => {
    const did = 'did:rooch:rooch1exampledid';
    const { publicKey, privateKey } = await CryptoUtils.generateKeyPair(KeyType.ED25519);
    const key: AgentKeyMaterial = {
      keyType: KeyType.ED25519,
      publicKeyMultibase: MultibaseCodec.encodeBase58btc(publicKey),
      privateKeyMultibase: MultibaseCodec.encodeBase58btc(privateKey),
      idFragment: 'agent-auth-1',
      createdAt: new Date().toISOString(),
    };
    const keyId = `${did}#agent-auth-1`;

    const header = await createDidAuthHeader({
      did,
      key,
      method: 'GET',
      url: 'https://did-check.nuwa.dev/whoami',
      body: '',
    });

    const resolver = {
      resolveDID: async () => ({
        id: did,
        verificationMethod: [
          {
            id: keyId,
            type: KeyType.ED25519,
            controller: did,
            publicKeyMultibase: key.publicKeyMultibase,
          },
        ],
        authentication: [keyId],
      }),
    };

    const result = await DIDAuth.v1.verifyAuthHeader(header, resolver as any);
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.signedObject.signature.signer_did).toBe(did);
      expect(result.signedObject.signature.key_id).toBe(keyId);
    }
  });
});

