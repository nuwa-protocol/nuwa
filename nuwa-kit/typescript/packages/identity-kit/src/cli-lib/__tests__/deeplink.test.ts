import { describe, expect, it } from '@jest/globals';
import { KeyType } from '../../types/crypto';
import { MultibaseCodec } from '../../multibase';
import { buildAddKeyDeepLink } from '../deeplink';
import type { AgentKeyMaterial } from '../types';

const key: AgentKeyMaterial = {
  keyType: KeyType.ED25519,
  publicKeyMultibase: 'z6MkgR7YfQjJY8iU8Q8m3w9yJ2Y1YvKq6xFy4V7w2xP3h1vA',
  privateKeyMultibase: 'z3wefakesampleprivatekey',
  keyFragment: 'agent-auth-1',
  createdAt: new Date().toISOString(),
};

describe('buildAddKeyDeepLink', () => {
  it('builds deep link with default redirect', () => {
    const result = buildAddKeyDeepLink({
      key,
      cadopDomain: 'id.nuwa.dev',
      keyFragment: 'agent-auth-1',
    });
    expect(result.url.startsWith('https://id.nuwa.dev/add-key?payload=')).toBe(true);
    expect(result.payload.redirectUri).toBe('https://id.nuwa.dev/close');
    expect(result.payload.verificationMethod.idFragment).toBe('agent-auth-1');

    const url = new URL(result.url);
    const payloadParam = url.searchParams.get('payload');
    expect(payloadParam).toBeTruthy();
    expect(payloadParam?.startsWith('u')).toBe(true);
    const decoded = MultibaseCodec.decodeBase64urlToString(payloadParam as string);
    expect(JSON.parse(decoded)).toEqual(result.payload);
  });
});
