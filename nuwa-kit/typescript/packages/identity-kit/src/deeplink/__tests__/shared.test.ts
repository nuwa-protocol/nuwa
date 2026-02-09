import { describe, expect, it } from '@jest/globals';
import { KeyType } from '../../types/crypto';
import { MultibaseCodec } from '../../multibase';
import {
  buildAddKeyDeepLink,
  buildAddKeyPayload,
  normalizeCadopDomain,
} from '../shared';

describe('deeplink shared utilities', () => {
  it('normalizes cadop domain for mainnet and local dev', () => {
    expect(normalizeCadopDomain('id.nuwa.dev')).toBe('https://id.nuwa.dev');
    expect(normalizeCadopDomain('localhost:3000')).toBe('http://localhost:3000');
  });

  it('builds deep link with multibase payload', () => {
    const payload = buildAddKeyPayload({
      keyType: KeyType.ED25519,
      publicKeyMultibase: 'z6MkgR7YfQjJY8iU8Q8m3w9yJ2Y1YvKq6xFy4V7w2xP3h1vA',
      keyFragment: 'agent-auth-1',
      relationships: ['authentication'],
      redirectUri: 'https://id.nuwa.dev/close',
      state: 'state-1',
    });

    const url = buildAddKeyDeepLink({
      cadopDomain: 'id.nuwa.dev',
      payload,
    });
    const payloadParam = new URL(url).searchParams.get('payload');

    expect(payloadParam).toBeTruthy();
    expect(payloadParam?.startsWith('u')).toBe(true);
    expect(JSON.parse(MultibaseCodec.decodeBase64urlToString(payloadParam as string))).toEqual(
      payload
    );
  });
});
