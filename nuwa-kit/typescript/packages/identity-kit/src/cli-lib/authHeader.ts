import { createHash } from 'crypto';
import { DIDAuth } from '../auth';
import { CryptoUtils } from '../crypto';
import { MultibaseCodec } from '../multibase';
import { AgentKeyMaterial } from './types';

export interface CreateDidAuthHeaderInput {
  did: string;
  key: AgentKeyMaterial;
  method: string;
  url: string;
  body?: string;
  audience?: string;
}

export async function createDidAuthHeader(input: CreateDidAuthHeaderInput): Promise<string> {
  const body = input.body || '';
  const method = input.method.toUpperCase();
  const target = new URL(input.url);
  const path = `${target.pathname}${target.search}`;
  const audience = input.audience || `${target.protocol}//${target.host}`;
  const keyId = `${input.did}#${input.key.idFragment}`;
  const bodyHash = createHash('sha256').update(body).digest('hex');

  const privateKey = MultibaseCodec.decode(input.key.privateKeyMultibase);
  const publicKey = MultibaseCodec.decode(input.key.publicKeyMultibase);

  const signer = {
    listKeyIds: async () => [keyId],
    signWithKeyId: async (data: Uint8Array, requestedKeyId: string) => {
      if (requestedKeyId !== keyId) {
        throw new Error(`Unknown keyId: ${requestedKeyId}`);
      }
      return CryptoUtils.sign(data, privateKey, input.key.keyType);
    },
    canSignWithKeyId: async (requestedKeyId: string) => requestedKeyId === keyId,
    getDid: async () => input.did,
    getKeyInfo: async (requestedKeyId: string) => {
      if (requestedKeyId !== keyId) return undefined;
      return { type: input.key.keyType, publicKey };
    },
  };

  const signed = await DIDAuth.v1.createSignature(
    {
      operation: 'http_request',
      params: {
        method,
        path,
        body_hash: bodyHash,
        audience,
      },
    },
    signer,
    keyId
  );

  return DIDAuth.v1.toAuthorizationHeader(signed);
}

