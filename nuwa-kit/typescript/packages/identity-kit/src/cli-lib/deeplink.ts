import { randomUUID } from 'crypto';
import { AddKeyRequestPayloadV1 } from '../types/deeplink';
import { AgentKeyMaterial } from './types';
import {
  buildAddKeyDeepLink as buildAddKeyDeepLinkUrl,
  buildAddKeyPayload,
  normalizeCadopDomain,
} from '../deeplink/shared';

export interface BuildDeepLinkInput {
  key: AgentKeyMaterial;
  cadopDomain: string;
  keyFragment: string;
  redirectUri?: string;
}

export interface BuildDeepLinkOutput {
  url: string;
  payload: AddKeyRequestPayloadV1;
}

export function buildAddKeyDeepLink(input: BuildDeepLinkInput): BuildDeepLinkOutput {
  const domain = normalizeCadopDomain(input.cadopDomain);
  const payload: AddKeyRequestPayloadV1 = buildAddKeyPayload({
    keyType: input.key.keyType,
    publicKeyMultibase: input.key.publicKeyMultibase,
    keyFragment: input.keyFragment,
    relationships: ['authentication'],
    redirectUri: input.redirectUri || `${domain}/close`,
    state: randomUUID(),
  });
  return {
    url: buildAddKeyDeepLinkUrl({ cadopDomain: domain, payload }),
    payload,
  };
}
