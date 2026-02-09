import { describe, expect, it, beforeEach, jest } from '@jest/globals';
import type { AgentKeyMaterial } from '../types';
import { KeyType } from '../../types/crypto';
import { sendDidAuthRequest } from '../http';

jest.mock('../authHeader', () => ({
  createDidAuthHeader: jest.fn(async () => 'DIDAuthV1 mocked'),
}));

const key: AgentKeyMaterial = {
  keyType: KeyType.ED25519,
  publicKeyMultibase: 'z6MkgR7YfQjJY8iU8Q8m3w9yJ2Y1YvKq6xFy4V7w2xP3h1vA',
  privateKeyMultibase: 'z3wefakesampleprivatekey',
  keyFragment: 'agent-auth-1',
  createdAt: new Date().toISOString(),
};

describe('sendDidAuthRequest', () => {
  beforeEach(() => {
    jest.restoreAllMocks();
  });

  it('merges authorization and custom headers, and sends body for POST', async () => {
    const fetchSpy = jest.spyOn(globalThis, 'fetch' as any).mockResolvedValue({
      status: 200,
      statusText: 'OK',
      text: async () => '{"ok":true}',
    } as any);

    const response = await sendDidAuthRequest({
      did: 'did:rooch:example',
      key,
      method: 'POST',
      url: 'https://did-check.nuwa.dev/whoami',
      body: '{"hello":"world"}',
      headers: {
        'X-Test': '1',
      },
    });

    expect(response.status).toBe(200);
    expect(response.authorization).toBe('DIDAuthV1 mocked');
    expect(fetchSpy).toHaveBeenCalledTimes(1);
    const fetchInput = fetchSpy.mock.calls[0][1] as RequestInit;
    const headers = fetchInput.headers as Headers;
    expect(fetchInput.method).toBe('POST');
    expect(fetchInput.body).toBe('{"hello":"world"}');
    expect(headers.get('Authorization')).toBe('DIDAuthV1 mocked');
    expect(headers.get('Content-Type')).toBe('application/json');
    expect(headers.get('X-Test')).toBe('1');
  });

  it('throws when GET has a request body', async () => {
    await expect(
      sendDidAuthRequest({
        did: 'did:rooch:example',
        key,
        method: 'GET',
        url: 'https://did-check.nuwa.dev/whoami',
        body: '{"bad":"input"}',
      })
    ).rejects.toThrow('GET requests must not include a body');
  });
});
