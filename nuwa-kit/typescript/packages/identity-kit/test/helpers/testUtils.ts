import { DIDDocument, ServiceEndpoint, VerificationMethod, KEY_TYPE } from '../../src/index';

/**
 * Creates a test DID document
 * @param did The DID to use
 * @returns A test DID document
 */
export function createTestDIDDocument(did: string): DIDDocument {
  return {
    '@context': ['https://www.w3.org/ns/did/v1', 'https://w3id.org/security/suites/jws-2020/v1'],
    id: did,
    controller: did,
    verificationMethod: [],
    authentication: [],
    assertionMethod: [],
    capabilityInvocation: [],
    capabilityDelegation: [],
  };
}

/**
 * Creates a test verification method
 * @param id The ID of the verification method
 * @returns A test verification method
 */
export function createTestVerificationMethod(id: string): VerificationMethod {
  return {
    id,
    type: KEY_TYPE.ED25519,
    controller: id.split('#')[0],
    publicKeyMultibase: 'z6MkhaXgBZDvotDkL5257faiztiGiC2QtKLGpbnnEGta2doK',
  };
}

/**
 * Creates a test service
 * @param id The ID of the service
 * @returns A test service
 */
export function createTestService(id: string): ServiceEndpoint {
  return {
    id,
    type: 'TestService',
    serviceEndpoint: 'https://example.com/test',
  };
}
