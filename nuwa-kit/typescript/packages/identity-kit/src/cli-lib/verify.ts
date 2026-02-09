import { initRoochVDR, VDRRegistry } from '../vdr';

export interface VerifyDidBindingInput {
  did: string;
  keyId: string;
  network: 'main' | 'test';
  rpcUrl?: string;
}

export interface VerifyDidBindingResult {
  did: string;
  keyId: string;
  verificationMethodFound: boolean;
  authenticationBound: boolean;
}

export async function verifyDidKeyBinding(
  input: VerifyDidBindingInput
): Promise<VerifyDidBindingResult> {
  initRoochVDR(input.network, input.rpcUrl);
  const resolver = VDRRegistry.getInstance();
  const doc = await resolver.resolveDID(input.did, { forceRefresh: true });
  if (!doc) {
    throw new Error(`Unable to resolve DID: ${input.did}`);
  }

  const verificationMethodFound = (doc.verificationMethod || []).some(vm => vm.id === input.keyId);
  const authenticationBound = (doc.authentication || []).some(entry => {
    if (typeof entry === 'string') return entry === input.keyId;
    return entry.id === input.keyId;
  });

  return {
    did: input.did,
    keyId: input.keyId,
    verificationMethodFound,
    authenticationBound,
  };
}

