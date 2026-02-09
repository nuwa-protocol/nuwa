import { randomUUID } from 'crypto';
import { AddKeyRequestPayloadV1 } from '../types/deeplink';
import { AgentKeyMaterial } from './types';

export interface BuildDeepLinkInput {
  key: AgentKeyMaterial;
  cadopDomain: string;
  idFragment: string;
  redirectUri?: string;
}

export interface BuildDeepLinkOutput {
  url: string;
  payload: AddKeyRequestPayloadV1;
}

export function buildAddKeyDeepLink(input: BuildDeepLinkInput): BuildDeepLinkOutput {
  const domain = normalizeCadopDomain(input.cadopDomain);
  const payload: AddKeyRequestPayloadV1 = {
    version: 1,
    verificationMethod: {
      type: input.key.keyType,
      publicKeyMultibase: input.key.publicKeyMultibase,
      idFragment: input.idFragment,
    },
    verificationRelationships: ['authentication'],
    redirectUri: input.redirectUri || `${domain}/close`,
    state: randomUUID(),
  };
  const encodedPayload = Buffer.from(JSON.stringify(payload)).toString('base64url');
  return {
    url: `${domain}/add-key?payload=${encodedPayload}`,
    payload,
  };
}

function normalizeCadopDomain(cadopDomain: string): string {
  const trimmed = cadopDomain.trim().replace(/\/+$/, '');
  if (trimmed.startsWith('http://') || trimmed.startsWith('https://')) {
    return trimmed;
  }
  return `https://${trimmed}`;
}

