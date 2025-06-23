// Using the new modular types system
export * from './types/index';
export * from './IdentityKit';
export * from './CadopIdentityKit';
export * from './VDRRegistry';
export * from './vdr';
export * from './cadopUtils';
export * from './multibase';
export * from './crypto';
export * from './utils/base64';
export { DIDAuth } from './auth';
export { initRoochVDR } from './vdr';
export * from './keys';
export * from './signers';
export { InMemoryLRUDIDDocumentCache } from './cache/InMemoryLRUDIDDocumentCache';
export type { DIDDocumentCache } from './types/did';
export { DebugLogger } from './DebugLogger';
