import { KeyVDR } from '../../src/vdr/keyVDR';
import {
  DIDDocument,
  ServiceEndpoint,
  VerificationMethod,
  VerificationRelationship,
  DIDCreationRequest,
} from '../../src/types';
import {
  createTestDIDDocument,
  createTestVerificationMethod,
  createTestService,
} from '../helpers/testUtils';
import { describe, it, expect, beforeEach, jest } from '@jest/globals';

// Test helpers
function createTestDIDDocumentWithMultipleKeys(did: string, keyConfig: any): DIDDocument {
  const doc = createTestDIDDocument(did);

  // Add keys based on configuration
  if (keyConfig.withCapabilityDelegation) {
    const keyId = keyConfig.withCapabilityDelegation;
    doc.verificationMethod!.push({
      id: keyId,
      type: 'Ed25519VerificationKey2020',
      controller: did,
      publicKeyMultibase: 'z2DEF456AbCdEfG',
    });
    doc.capabilityDelegation!.push(keyId);
  }

  if (keyConfig.withoutCapabilityDelegation) {
    const keyId = keyConfig.withoutCapabilityDelegation;
    doc.verificationMethod!.push({
      id: keyId,
      type: 'Ed25519VerificationKey2020',
      controller: did,
      publicKeyMultibase: 'z3HIJ789KlMnOp',
    });
    // Don't add to capabilityDelegation
  }

  if (keyConfig.withCapabilityInvocation) {
    const keyId = keyConfig.withCapabilityInvocation;
    doc.verificationMethod!.push({
      id: keyId,
      type: 'Ed25519VerificationKey2020',
      controller: did,
      publicKeyMultibase: 'z4QRS012TuVwXy',
    });
    doc.capabilityInvocation!.push(keyId);
  }

  if (keyConfig.withoutCapabilityInvocation) {
    const keyId = keyConfig.withoutCapabilityInvocation;
    doc.verificationMethod!.push({
      id: keyId,
      type: 'Ed25519VerificationKey2020',
      controller: did,
      publicKeyMultibase: 'z5ZAB345CdEfGh',
    });
    // Don't add to capabilityInvocation
  }

  return doc;
}

describe('KeyVDR', () => {
  let keyVDR: KeyVDR;
  let testDID: string;
  let testDocument: DIDDocument;

  beforeEach(() => {
    keyVDR = new KeyVDR();
    keyVDR.reset(); // Reset the cache
    testDID = 'did:key:z6MkhaXgBZDvotDkL5257faiztiGiC2QtKLGpbnnEGta2doK';
    testDocument = createTestDIDDocument(testDID);
  });

  describe('create', () => {
    it('should create a DID document with the specified key', async () => {
      const request = {
        publicKeyMultibase: 'z6MkhaXgBZDvotDkL5257faiztiGiC2QtKLGpbnnEGta2doK',
        keyType: 'Ed25519VerificationKey2020',
        preferredDID: testDID,
        controller: testDID,
        initialRelationships: [
          'authentication',
          'assertionMethod',
          'capabilityInvocation',
          'capabilityDelegation',
        ] as VerificationRelationship[],
        initialServices: undefined,
        additionalVerificationMethods: undefined,
      };

      const result = await keyVDR.create(request);
      expect(result.success).toBe(true);
      expect(result.didDocument).toBeDefined();
      expect(result.didDocument!.id).toBe(testDID);

      const doc = await keyVDR.resolve(testDID);
      expect(doc).toBeTruthy();
      expect(doc!.id).toBe(testDID);
      expect(doc!.verificationMethod).toBeDefined();
      expect(doc!.verificationMethod!.length).toBe(1);
      expect(doc!.verificationMethod![0].publicKeyMultibase).toBe(request.publicKeyMultibase);
    });

    it('should not create a DID document with invalid key format', async () => {
      const request = {
        publicKeyMultibase: 'invalid-key',
        keyType: 'Ed25519VerificationKey2020',
        preferredDID: 'did:key:invalid-key',
        controller: 'did:key:invalid-key',
        initialRelationships: ['authentication'] as VerificationRelationship[],
        initialServices: undefined,
        additionalVerificationMethods: undefined,
      };

      const result = await keyVDR.create(request);
      expect(result.success).toBe(false);
      expect(result.error).toBeDefined();
    });
  });

  describe('resolve', () => {
    it('should resolve a created DID document', async () => {
      // First create a document
      const request = {
        publicKeyMultibase: 'z6MkhaXgBZDvotDkL5257faiztiGiC2QtKLGpbnnEGta2doK',
        keyType: 'Ed25519VerificationKey2020',
        preferredDID: testDID,
        controller: testDID,
        initialRelationships: ['authentication'] as VerificationRelationship[],
        initialServices: undefined,
        additionalVerificationMethods: undefined,
      };

      await keyVDR.create(request);

      const doc = await keyVDR.resolve(testDID);
      expect(doc).toBeTruthy();
      expect(doc!.id).toBe(testDID);
    });

    it('should return null for non-existent DID', async () => {
      const doc = await keyVDR.resolve('did:key:nonexistent');
      expect(doc).toBeNull();
    });
  });

  describe('exists', () => {
    it('should return true for existing DID', async () => {
      // First create a document
      const request = {
        publicKeyMultibase: 'z6MkhaXgBZDvotDkL5257faiztiGiC2QtKLGpbnnEGta2doK',
        keyType: 'Ed25519VerificationKey2020',
        preferredDID: testDID,
        controller: testDID,
        initialRelationships: ['authentication'] as VerificationRelationship[],
        initialServices: undefined,
        additionalVerificationMethods: undefined,
      };

      await keyVDR.create(request);

      const exists = await keyVDR.exists(testDID);
      expect(exists).toBe(true);
    });

    it('should return false for non-existent DID', async () => {
      const exists = await keyVDR.exists('did:key:invalid-format');
      expect(exists).toBe(false);
    });
  });

  describe('verification method operations', () => {
    const did = 'did:key:z6MkhaXgBZDvotDkL5257faiztiGiC2QtKLGpbnnEGta2doK';

    beforeEach(async () => {
      // Create a new DID document using create method
      const request: DIDCreationRequest = {
        publicKeyMultibase: 'z6MkhaXgBZDvotDkL5257faiztiGiC2QtKLGpbnnEGta2doK',
        keyType: 'Ed25519VerificationKey2020',
        preferredDID: did,
        controller: did,
        initialRelationships: [
          'authentication',
          'assertionMethod',
          'capabilityInvocation',
          'capabilityDelegation',
        ],
        initialServices: undefined,
        additionalVerificationMethods: undefined,
      };

      const result = await keyVDR.create(request);
      expect(result.success).toBe(true);
    });

    it('should add a verification method', async () => {
      const newMethod = createTestVerificationMethod(`${did}#new-key`);

      const result = await keyVDR.addVerificationMethod(did, newMethod, ['authentication'], {
        keyId: `${did}#account-key`,
      });

      expect(result).toBe(true);

      // Verify it was added
      const updated = await keyVDR.resolve(did);
      expect(updated?.verificationMethod).toHaveLength(2);
      expect(updated?.verificationMethod?.[1].id).toEqual(newMethod.id);

      // Verify it was added to the authentication relationship
      expect(updated?.authentication).toContain(newMethod.id);
    });

    it('should remove a verification method', async () => {
      // First add a method
      const newMethod = createTestVerificationMethod(`${did}#new-key`);
      await keyVDR.addVerificationMethod(did, newMethod, ['authentication'], {
        keyId: `${did}#account-key`,
      });

      // Now remove it
      const result = await keyVDR.removeVerificationMethod(did, newMethod.id, {
        keyId: `${did}#account-key`,
      });

      expect(result).toBe(true);

      // Verify it was removed
      const updated = await keyVDR.resolve(did);
      expect(updated?.verificationMethod).toHaveLength(1);
      expect(updated?.authentication).not.toContain(newMethod.id);
    });

    it('should not allow removing the primary key', async () => {
      await expect(async () => {
        await keyVDR.removeVerificationMethod(did, `${did}#account-key`, {
          keyId: `${did}#account-key`,
        });
      }).rejects.toThrow(/Cannot remove the primary key/);
    });
  });

  describe('service operations', () => {
    const did = 'did:key:z6MkhaXgBZDvotDkL5257faiztiGiC2QtKLGpbnnEGta2doK';

    beforeEach(async () => {
      // Create a new DID document using create method
      const request: DIDCreationRequest = {
        publicKeyMultibase: 'z6MkhaXgBZDvotDkL5257faiztiGiC2QtKLGpbnnEGta2doK',
        keyType: 'Ed25519VerificationKey2020',
        preferredDID: did,
        controller: did,
        initialRelationships: [
          'authentication',
          'assertionMethod',
          'capabilityInvocation',
          'capabilityDelegation',
        ],
        initialServices: undefined,
        additionalVerificationMethods: undefined,
      };

      const result = await keyVDR.create(request);
      expect(result.success).toBe(true);
    });

    it('should add a service', async () => {
      const service = {
        id: `${did}#service1`,
        type: 'TestService',
        serviceEndpoint: 'https://example.com',
      };

      const addResult = await keyVDR.addService(did, service, {
        keyId: `${did}#account-key`,
      });
      expect(addResult).toBe(true);

      const doc = await keyVDR.resolve(did);
      expect(doc?.service).toHaveLength(1);
      expect(doc?.service?.[0]).toEqual(service);
    });

    it('should remove a service', async () => {
      const service = {
        id: `${did}#service1`,
        type: 'TestService',
        serviceEndpoint: 'https://example.com',
      };

      await keyVDR.addService(did, service, {
        keyId: `${did}#account-key`,
      });

      const removeResult = await keyVDR.removeService(did, service.id, {
        keyId: `${did}#account-key`,
      });
      expect(removeResult).toBe(true);

      const doc = await keyVDR.resolve(did);
      expect(doc?.service).toHaveLength(0);
    });
  });

  describe('relationship operations', () => {
    const did = 'did:key:z6MkhaXgBZDvotDkL5257faiztiGiC2QtKLGpbnnEGta2doK';

    beforeEach(async () => {
      // Create a new DID document using create method
      const request: DIDCreationRequest = {
        publicKeyMultibase: 'z6MkhaXgBZDvotDkL5257faiztiGiC2QtKLGpbnnEGta2doK',
        keyType: 'Ed25519VerificationKey2020',
        preferredDID: did,
        controller: did,
        initialRelationships: [
          'authentication',
          'assertionMethod',
          'capabilityInvocation',
          'capabilityDelegation',
        ],
        initialServices: undefined,
        additionalVerificationMethods: undefined,
      };

      const result = await keyVDR.create(request);
      expect(result.success).toBe(true);
    });

    it('should update relationships', async () => {
      const newVM = {
        id: `${did}#newKey`,
        type: 'Ed25519VerificationKey2020',
        controller: did,
        publicKeyMultibase: 'z6MkhaXgBZDvotDkL5257faiztiGiC2QtKLGpbnnEGta2doK',
      };

      await keyVDR.addVerificationMethod(did, newVM, ['authentication'], {
        keyId: `${did}#account-key`,
      });

      const updateResult = await keyVDR.updateRelationships(
        did,
        newVM.id,
        ['assertionMethod'] as VerificationRelationship[],
        ['authentication'] as VerificationRelationship[],
        { keyId: `${did}#account-key` }
      );
      expect(updateResult).toBe(true);

      const doc = await keyVDR.resolve(did);
      expect(doc?.authentication).not.toContain(newVM.id);
      expect(doc?.assertionMethod).toContain(newVM.id);
    });
  });

  describe('permission model', () => {
    const did = 'did:key:z6MkhaXgBZDvotDkL5257faiztiGiC2QtKLGpbnnEGta2doK';

    beforeEach(async () => {
      // Create a document with various permission keys
      const request: DIDCreationRequest = {
        publicKeyMultibase: 'z6MkhaXgBZDvotDkL5257faiztiGiC2QtKLGpbnnEGta2doK',
        keyType: 'Ed25519VerificationKey2020',
        preferredDID: did,
        controller: did,
        initialRelationships: [
          'authentication',
          'assertionMethod',
          'capabilityInvocation',
          'capabilityDelegation',
        ],
        initialServices: undefined,
        additionalVerificationMethods: [
          {
            id: `${did}#withDelegation`,
            type: 'Ed25519VerificationKey2020',
            controller: did,
            publicKeyMultibase: 'z2DEF456AbCdEfG',
          },
          {
            id: `${did}#withoutDelegation`,
            type: 'Ed25519VerificationKey2020',
            controller: did,
            publicKeyMultibase: 'z3HIJ789KlMnOp',
          },
          {
            id: `${did}#withInvocation`,
            type: 'Ed25519VerificationKey2020',
            controller: did,
            publicKeyMultibase: 'z4QRS012TuVwXy',
          },
          {
            id: `${did}#withoutInvocation`,
            type: 'Ed25519VerificationKey2020',
            controller: did,
            publicKeyMultibase: 'z5ZAB345CdEfGh',
          },
        ],
      };

      const result = await keyVDR.create(request);
      expect(result.success).toBe(true);

      // Add relationships
      await keyVDR.updateRelationships(did, `${did}#withDelegation`, ['capabilityDelegation'], [], {
        keyId: `${did}#account-key`,
      });
      await keyVDR.updateRelationships(did, `${did}#withInvocation`, ['capabilityInvocation'], [], {
        keyId: `${did}#account-key`,
      });
    });

    it('should require capabilityDelegation for adding verification methods', async () => {
      const newMethod = createTestVerificationMethod(`${did}#new-key`);

      // Should succeed with a key that has capabilityDelegation
      const success = await keyVDR.addVerificationMethod(did, newMethod, ['authentication'], {
        keyId: `${did}#withDelegation`,
      });
      expect(success).toBe(true);

      // Should fail with a key that doesn't have capabilityDelegation
      await expect(async () => {
        await keyVDR.addVerificationMethod(
          did,
          createTestVerificationMethod(`${did}#another-key`),
          ['authentication'],
          { keyId: `${did}#withoutDelegation` }
        );
      }).rejects.toThrow(/does not have capabilityDelegation permission/);
    });

    it('should require capabilityInvocation for adding services', async () => {
      const service = createTestService(`${did}#service1`);

      // Should succeed with a key that has capabilityInvocation
      const success = await keyVDR.addService(did, service, { keyId: `${did}#withInvocation` });
      expect(success).toBe(true);

      // Should fail with a key that doesn't have capabilityInvocation
      await expect(async () => {
        await keyVDR.addService(did, createTestService(`${did}#service2`), {
          keyId: `${did}#withoutInvocation`,
        });
      }).rejects.toThrow(/does not have capabilityInvocation permission/);
    });
  });
});
