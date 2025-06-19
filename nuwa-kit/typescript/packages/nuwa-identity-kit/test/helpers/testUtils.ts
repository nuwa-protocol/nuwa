import {
  DIDDocument,
  ServiceEndpoint,
  VerificationMethod,
  VerificationRelationship,
  SignerInterface,
  MasterIdentity,
  KEY_TYPE,
  KeyType,
} from '../../src/types';
import { CryptoUtils } from '../../src/cryptoUtils';

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

/**
 * Creates a test master identity
 * @param method The DID method to use
 * @param keyType Optional key type to use (Ed25519VerificationKey2020 or EcdsaSecp256k1VerificationKey2019)
 * @param masterKeyIdFragment Optional master key ID fragment
 * @returns A test master identity
 */
export async function createTestMasterIdentity(
  method: string,
  keyType?: KeyType,
  masterKeyIdFragment?: string
): Promise<MasterIdentity> {
  // Generate a test key pair
  const actualKeyType = keyType || KEY_TYPE.ED25519;
  const keyPair = await CryptoUtils.generateKeyPair(actualKeyType);
  const publicKeyMultibase = await CryptoUtils.publicKeyToMultibase(
    keyPair.publicKey as Uint8Array,
    actualKeyType
  );
  const did = `did:${method}:${publicKeyMultibase}`;
  const keyId = `${did}#${masterKeyIdFragment || publicKeyMultibase}`;

  return {
    did,
    masterKeyId: keyId,
    masterPublicKeyMultibase: publicKeyMultibase,
    masterPrivateKey: keyPair.privateKey,
  };
}
