import { 
  bcs, 
  address,
  AnnotatedMoveValueView,
  AnnotatedMoveStructView,
  AnnotatedMoveStructVectorView,
  sha3_256,
  toHEX,
  stringToBytes,
  Serializer,
  StructTag,
} from '@roochnetwork/rooch-sdk';
import { DIDDocument, ServiceEndpoint, VerificationMethod } from '../../types';

/**
 * BCS type definitions for DID related structs
 */

// SimpleMap schema generator
export function simpleMapSchema<K, V>(keySchema: any, valueSchema: any) {
  return bcs.struct('SimpleMap', {
    data: bcs.vector(bcs.tuple(keySchema, valueSchema)),
  });
}

// Basic DID struct
export interface DIDStruct {
  method: string;
  identifier: string;
}

// DID Document verification method
export interface MoveVerificationMethod {
  id: {
    did: DIDStruct;
    fragment: string;
  };
  type: string;
  controller: DIDStruct;
  public_key_multibase: string;
}

// DID Document service
export interface MoveService {
  id: {
    did: DIDStruct;
    fragment: string;
  };
  type: string;
  service_endpoint: string;
  properties: Map<string, string>;
}

// Complete DID Document struct from Move
export interface MoveDIDDocument {
  id: DIDStruct;
  controller: DIDStruct[];
  verification_methods: Map<string, MoveVerificationMethod>;
  authentication: string[];
  assertion_method: string[];
  capability_invocation: string[];
  capability_delegation: string[];
  key_agreement: string[];
  services: Map<string, MoveService>;
  also_known_as: string[];
}

// DID Created Event data
export interface DIDCreatedEventData {
  did: DIDStruct;
  object_id: string;
  controller: DIDStruct[];
  creator_address: address;
  creation_method: string;
}

/**
 * BCS Schemas
 */

// Basic DID schema
export const DIDSchema = bcs.struct('DID', {
  method: bcs.string(),
  identifier: bcs.string(),
});

// DID ID schema (with fragment)
export const DIDIdSchema = bcs.struct('DIDID', {
  did: DIDSchema,
  fragment: bcs.string(),
});

// Verification Method schema
export const VerificationMethodSchema = bcs.struct('VerificationMethod', {
  id: DIDIdSchema,
  type: bcs.string(),
  controller: DIDSchema,
  public_key_multibase: bcs.string(),
});

// Service schema
export const ServiceSchema = bcs.struct('Service', {
  id: DIDIdSchema,
  type: bcs.string(),
  service_endpoint: bcs.string(),
  properties: simpleMapSchema(bcs.string(), bcs.string()),
});

export const AccountCapSchema = bcs.struct('AccountCap', {
    addr: bcs.Address,
});

// Complete DID Document schema
export const DIDDocumentSchema = bcs.struct('DIDDocument', {
  id: DIDSchema,
  controller: bcs.vector(DIDSchema),
  verification_methods: simpleMapSchema(bcs.string(), VerificationMethodSchema),
  authentication: bcs.vector(bcs.string()),
  assertion_method: bcs.vector(bcs.string()),
  capability_invocation: bcs.vector(bcs.string()),
  capability_delegation: bcs.vector(bcs.string()),
  key_agreement: bcs.vector(bcs.string()),
  services: simpleMapSchema(bcs.string(), ServiceSchema),
  also_known_as: bcs.vector(bcs.string()),
  account_cap: AccountCapSchema,
});

// DID Created Event schema
export const DIDCreatedEventSchema = bcs.struct('DIDCreatedEvent', {
  did: DIDSchema,
  object_id: bcs.ObjectId,
  controller: bcs.vector(DIDSchema),
  creator_address: bcs.Address,
  creation_method: bcs.string(),
});

/**
 * SimpleMap type and conversion helpers
 */

// TypeScript interface for SimpleMap
export interface SimpleMap<K, V> {
  data: [K, V][];
}

// Convert SimpleMap to standard Map
export function simpleMapToMap<K, V>(simpleMap: SimpleMap<K, V>): Map<K, V> {
  return new Map(simpleMap.data);
}

// Convert standard Map to SimpleMap
export function mapToSimpleMap<K, V>(map: Map<K, V>): SimpleMap<K, V> {
  return {
    data: Array.from(map.entries())
  };
}

/**
 * Convert Move value to TypeScript value
 */
export function convertMoveValue<T>(moveValue: AnnotatedMoveValueView): T {
  if (typeof moveValue === 'string' || typeof moveValue === 'number' || typeof moveValue === 'boolean') {
    return moveValue as T;
  }

  const annotatedValue = moveValue as AnnotatedMoveStructView;
  if (annotatedValue.type === 'vector') {
    return (annotatedValue.value as unknown as AnnotatedMoveValueView[]).map(v => convertMoveValue(v)) as T;
  } else if (annotatedValue.type.startsWith('0x3::simple_map::SimpleMap')) {
    return simpleMapToMap(annotatedValue.value.data as unknown as SimpleMap<any, any>) as T;
  } else if (annotatedValue.type.startsWith('0x3::did::')) {
    return annotatedValue.value as T;
  } else {
    return annotatedValue.value as T;
  }
}

/**
 * Convert Move DID Document to standard DID Document interface
 */
export function convertMoveDIDDocumentToInterface(moveDoc: AnnotatedMoveStructView): DIDDocument {
  // Convert Move value to MoveDIDDocument
  const doc: MoveDIDDocument = {
    id: convertMoveValue(moveDoc.value.id),
    controller: convertMoveValue(moveDoc.value.controller),
    verification_methods: convertMoveValue(moveDoc.value.verification_methods),
    authentication: convertMoveValue(moveDoc.value.authentication),
    assertion_method: convertMoveValue(moveDoc.value.assertion_method),
    capability_invocation: convertMoveValue(moveDoc.value.capability_invocation),
    capability_delegation: convertMoveValue(moveDoc.value.capability_delegation),
    key_agreement: convertMoveValue(moveDoc.value.key_agreement),
    services: convertMoveValue(moveDoc.value.services),
    also_known_as: convertMoveValue(moveDoc.value.also_known_as),
  };

  // Create DID string
  const didId = `did:${doc.id.method}:${doc.id.identifier}`;
  
  // Convert controllers
  const controllers = doc.controller.map(c => `did:${c.method}:${c.identifier}`);
  
  // Convert verification methods
  const verificationMethods: VerificationMethod[] = [];
  doc.verification_methods.forEach((vm: MoveVerificationMethod) => {
    verificationMethods.push({
      id: `did:${vm.id.did.method}:${vm.id.did.identifier}#${vm.id.fragment}`,
      type: vm.type,
      controller: `did:${vm.controller.method}:${vm.controller.identifier}`,
      publicKeyMultibase: vm.public_key_multibase,
    });
  });
  
  // Convert services
  const services: ServiceEndpoint[] = [];
  doc.services.forEach((service: MoveService) => {
    const serviceEndpoint: ServiceEndpoint = {
      id: `did:${service.id.did.method}:${service.id.did.identifier}#${service.id.fragment}`,
      type: service.type,
      serviceEndpoint: service.service_endpoint,
    };
    
    // Add properties if they exist
    if (service.properties.size > 0) {
      const properties: { [key: string]: string } = {};
      service.properties.forEach((value, key) => {
        properties[key] = value;
      });
      (serviceEndpoint as any).properties = properties;
    }
    
    services.push(serviceEndpoint);
  });
  
  return {
    '@context': ['https://www.w3.org/ns/did/v1'],
    id: didId,
    controller: controllers,
    verificationMethod: verificationMethods,
    authentication: doc.authentication,
    assertionMethod: doc.assertion_method,
    capabilityInvocation: doc.capability_invocation,
    capabilityDelegation: doc.capability_delegation,
    keyAgreement: doc.key_agreement,
    service: services,
    alsoKnownAs: doc.also_known_as,
  };
}

/**
 * Parse DID Created Event data using BCS
 */
export function parseDIDCreatedEvent(eventData: string): DIDCreatedEventData {
  const hexData = eventData.startsWith('0x') ? eventData.slice(2) : eventData;
  const bytes = new Uint8Array(hexData.match(/.{1,2}/g)?.map((byte: string) => parseInt(byte, 16)) || []);
  return DIDCreatedEventSchema.parse(bytes);
}

/**
 * Get DID address from DID Created Event data
 */
export function getDIDAddressFromEvent(eventData: DIDCreatedEventData): string {
  return `did:${eventData.did.method}:${eventData.did.identifier}`;
}

// Define StructTag for DIDDocument
export const DIDDocumentStructTag = {
  address: '0x3',
  module: 'did',
  name: 'DIDDocument',
  typeParams: [],
};

/**
 * Calculate DID Object ID from identifier
 * This matches the Move function custom_object_id<ID, T>(id: ID)
 */
export function resolveDidObjectID(identifier: string): string {
  return customObjectID(identifier, DIDDocumentStructTag);
}

export function customObjectID(id: string, structTag: StructTag): string {
  const idBytes = stringToBytes('utf8', id);
  const typeBytes = stringToBytes('utf8', Serializer.structTagToCanonicalString(structTag));
  const bytes = new Uint8Array(idBytes.length + typeBytes.length);
  bytes.set(idBytes);
  bytes.set(typeBytes, idBytes.length);
  const hash = sha3_256(bytes);
  return `0x${toHEX(hash)}`;
}