import { DIDDocument } from '../types';
import { VDRInterface } from './types';

/**
 * Resolves a DID using an array of VDRs
 *
 * @param did The DID to resolve
 * @param vdrs Array of VDR instances to try
 * @returns The resolved DID document or null if not found
 * @throws Error if no VDR is available for the DID method
 */
export async function resolveDIDWithVDRs(
  did: string,
  vdrs: VDRInterface[]
): Promise<DIDDocument | null> {
  if (!did.startsWith('did:')) {
    throw new Error(`Invalid DID format: ${did}`);
  }

  const didMethod = did.split(':')[1];

  // Find a VDR that can handle this DID method
  const matchingVDR = vdrs.find(vdr => vdr.getMethod() === didMethod);

  if (!matchingVDR) {
    throw new Error(`No VDR available for DID method '${didMethod}'`);
  }

  try {
    return await matchingVDR.resolve(did);
  } catch (error) {
    console.error(`Error resolving DID ${did}:`, error);
    return null;
  }
}

/**
 * Extracts the method from a DID
 *
 * @param did The DID to extract the method from
 * @returns The DID method (e.g., 'key', 'web')
 */
export function extractDIDMethod(did: string): string {
  if (!did.startsWith('did:')) {
    throw new Error(`Invalid DID format: ${did}`);
  }

  const parts = did.split(':');
  if (parts.length < 3) {
    throw new Error(`Invalid DID format: ${did}`);
  }

  return parts[1];
}

/**
 * Creates a DID string based on method and identifier
 *
 * @param method The DID method (e.g., 'key', 'web')
 * @param identifier The method-specific identifier
 * @returns A properly formatted DID string
 */
export function createDID(method: string, identifier: string): string {
  return `did:${method}:${identifier}`;
}

/**
 * Gets a verification method from a DID document by its ID
 *
 * @param didDocument The DID document
 * @param vmId The verification method ID (can be a full ID or just the fragment)
 * @returns The verification method or undefined if not found
 */
export function getVerificationMethod(didDocument: DIDDocument, vmId: string): any | undefined {
  // Handle both fragment-only IDs and full IDs
  const fullId = vmId.includes('#') ? vmId : `${didDocument.id}#${vmId}`;

  return didDocument.verificationMethod?.find(vm => vm.id === fullId || vm.id === vmId);
}
