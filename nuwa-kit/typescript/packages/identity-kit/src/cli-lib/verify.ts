import { initRoochVDR, VDRRegistry } from '../vdr';

export interface VerifyDidBindingInput {
  did: string;
  keyId: string;
  network: 'main' | 'test';
  rpcUrl?: string;
  resolver?: {
    resolveDID: (
      did: string,
      options?: {
        forceRefresh?: boolean;
      }
    ) => Promise<any>;
  };
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
  const resolver = input.resolver || (() => {
    initRoochVDR(input.network, input.rpcUrl);
    return VDRRegistry.getInstance();
  })();
  const doc = await resolver.resolveDID(input.did, { forceRefresh: true });
  if (!doc) {
    throw new Error(`Unable to resolve DID: ${input.did}`);
  }

  const verificationMethods = ((doc as { verificationMethod?: { id: string }[] }).verificationMethod || []);
  const authentications = ((doc as { authentication?: Array<string | { id: string }> }).authentication || []);

  const verificationMethodFound = verificationMethods.some(
    (vm: { id: string }) => vm.id === input.keyId
  );
  const authenticationBound = authentications.some((entry: string | { id: string }) => {
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
