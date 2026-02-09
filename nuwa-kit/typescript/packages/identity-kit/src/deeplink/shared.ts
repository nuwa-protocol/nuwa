import { MultibaseCodec } from '../multibase';
import type { KeyType } from '../types/crypto';
import type { AddKeyRequestPayloadV1 } from '../types/deeplink';
import type { VerificationRelationship } from '../types/did';

export interface BuildAddKeyPayloadInput {
  keyType: KeyType;
  publicKeyMultibase: string;
  keyFragment: string;
  relationships: VerificationRelationship[];
  redirectUri: string;
  state: string;
  agentDid?: string;
  scopes?: string[];
}

export interface BuildAddKeyDeepLinkInput {
  cadopDomain: string;
  payload: AddKeyRequestPayloadV1;
}

const LOCALHOST_PATTERN = /^(localhost|\d+\.\d+\.\d+\.\d+)(:\d+)?$/;

export function normalizeCadopDomain(cadopDomain: string): string {
  const trimmed = cadopDomain.trim().replace(/\/+$/, '');
  if (trimmed.startsWith('http://') || trimmed.startsWith('https://')) {
    return trimmed;
  }
  if (LOCALHOST_PATTERN.test(trimmed)) {
    return `http://${trimmed}`;
  }
  return `https://${trimmed}`;
}

export function buildAddKeyPayload(input: BuildAddKeyPayloadInput): AddKeyRequestPayloadV1 {
  const payload: AddKeyRequestPayloadV1 = {
    version: 1,
    verificationMethod: {
      type: input.keyType,
      publicKeyMultibase: input.publicKeyMultibase,
      idFragment: input.keyFragment,
    },
    verificationRelationships: input.relationships,
    redirectUri: input.redirectUri,
    state: input.state,
  };

  if (input.agentDid) {
    payload.agentDid = input.agentDid;
  }

  if (input.scopes && input.scopes.length > 0) {
    payload.scopes = input.scopes;
  }

  return payload;
}

export function encodeAddKeyPayload(payload: AddKeyRequestPayloadV1): string {
  return MultibaseCodec.encodeBase64url(JSON.stringify(payload));
}

export function buildAddKeyDeepLink(input: BuildAddKeyDeepLinkInput): string {
  const domain = normalizeCadopDomain(input.cadopDomain);
  const encodedPayload = encodeAddKeyPayload(input.payload);
  return `${domain}/add-key?payload=${encodedPayload}`;
}
