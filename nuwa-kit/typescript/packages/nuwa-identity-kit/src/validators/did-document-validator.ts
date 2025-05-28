import { DIDDocument, ServiceEndpoint, VerificationMethod } from '../types';

export interface ValidationResult {
  isValid: boolean;
  errors: string[];
}

/**
 * Validates a DID document according to the W3C DID Core specification.
 * @param document The DID document to validate
 * @returns A validation result object
 */
export function validateDIDDocument(document: DIDDocument): ValidationResult {
  const errors: string[] = [];
  
  // Check required properties
  if (!document.id) {
    errors.push('DID document must have an id');
  } else if (!document.id.startsWith('did:')) {
    errors.push('DID document id must be a valid DID');
  }
  
  if (!document['@context']) {
    errors.push('DID document must have a @context');
  } else if (!Array.isArray(document['@context'])) {
    errors.push('DID document @context must be an array');
  }
  
  // Check verification methods
  if (!document.verificationMethod || document.verificationMethod.length === 0) {
    errors.push('DID document must have at least one verification method');
  } else {
    document.verificationMethod.forEach((vm, index) => {
      validateVerificationMethod(vm, index, errors);
    });
  }
  
  // Check services
  if (document.service) {
    document.service.forEach((service, index) => {
      validateService(service, index, errors);
    });
  }
  
  // Check verification relationships
  validateVerificationRelationships(document, errors);
  
  return {
    isValid: errors.length === 0,
    errors
  };
}

/**
 * Validates a verification method according to the W3C DID Core specification.
 * @param vm The verification method to validate
 * @param index The index of the verification method in the array
 * @param errors The array to collect validation errors
 */
function validateVerificationMethod(vm: VerificationMethod, index: number, errors: string[]): void {
  if (!vm.id) {
    errors.push(`Verification method at index ${index} must have an id`);
  }
  
  if (!vm.type) {
    errors.push('Verification method must have a type');
  }
  
  if (!vm.controller) {
    errors.push('Verification method must have a controller');
  }
  
  // Check that at least one key material property is present
  const hasKeyMaterial = vm.publicKeyMultibase || vm.publicKeyJwk;
  if (!hasKeyMaterial) {
    errors.push('Verification method must have at least one key material property');
  }
}

/**
 * Validates a service according to the W3C DID Core specification.
 * @param service The service to validate
 * @param index The index of the service in the array
 * @param errors The array to collect validation errors
 */
function validateService(service: ServiceEndpoint, index: number, errors: string[]): void {
  if (!service.id) {
    errors.push(`Service at index ${index} must have an id`);
  }
  
  if (!service.type) {
    errors.push('Service must have a type');
  }
  
  if (!service.serviceEndpoint) {
    errors.push('Service must have a serviceEndpoint');
  }
}

/**
 * Validates verification relationships according to the W3C DID Core specification.
 * @param document The DID document containing the relationships
 * @param errors The array to collect validation errors
 */
function validateVerificationRelationships(document: DIDDocument, errors: string[]): void {
  const verificationMethodIds = new Set(document.verificationMethod?.map(vm => vm.id) || []);
  
  // Helper function to validate relationship references
  const validateReferences = (refs: (string | VerificationMethod)[] | undefined, relName: string) => {
    if (!refs) return;
    
    refs.forEach(ref => {
      const refId = typeof ref === 'string' ? ref : ref.id;
      if (!verificationMethodIds.has(refId)) {
        errors.push(`${relName} reference ${refId} does not exist in verificationMethod`);
      }
    });
  };
  
  // Validate each relationship type
  validateReferences(document.authentication, 'Authentication');
  validateReferences(document.assertionMethod, 'AssertionMethod');
  validateReferences(document.capabilityInvocation, 'CapabilityInvocation');
  validateReferences(document.capabilityDelegation, 'CapabilityDelegation');
} 