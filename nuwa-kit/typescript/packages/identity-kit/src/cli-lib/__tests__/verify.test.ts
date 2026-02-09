import { describe, expect, it } from '@jest/globals';
import { verifyDidKeyBinding } from '../verify';

describe('verifyDidKeyBinding', () => {
  it('accepts authentication entries as strings', async () => {
    const did = 'did:rooch:example';
    const keyId = `${did}#agent-auth-1`;
    const result = await verifyDidKeyBinding({
      did,
      keyId,
      network: 'main',
      resolver: {
        resolveDID: async () => ({
          id: did,
          verificationMethod: [{ id: keyId }],
          authentication: [keyId],
        }),
      },
    });

    expect(result.verificationMethodFound).toBe(true);
    expect(result.authenticationBound).toBe(true);
  });

  it('accepts authentication entries as objects', async () => {
    const did = 'did:rooch:example';
    const keyId = `${did}#agent-auth-1`;
    const result = await verifyDidKeyBinding({
      did,
      keyId,
      network: 'main',
      resolver: {
        resolveDID: async () => ({
          id: did,
          verificationMethod: [{ id: keyId }],
          authentication: [{ id: keyId }],
        }),
      },
    });

    expect(result.verificationMethodFound).toBe(true);
    expect(result.authenticationBound).toBe(true);
  });

  it('reports missing bindings', async () => {
    const did = 'did:rooch:example';
    const keyId = `${did}#agent-auth-1`;
    const result = await verifyDidKeyBinding({
      did,
      keyId,
      network: 'main',
      resolver: {
        resolveDID: async () => ({
          id: did,
          verificationMethod: [],
          authentication: [],
        }),
      },
    });

    expect(result.verificationMethodFound).toBe(false);
    expect(result.authenticationBound).toBe(false);
  });
});

