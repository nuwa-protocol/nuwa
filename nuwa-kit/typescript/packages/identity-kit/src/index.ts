export * from './types';
export * from './IdentityKit';
export * from './CadopIdentityKit';
export * from './vdr';
export * from './multibase';
export * from './crypto';
export * from './auth';
export { initRoochVDR } from './vdr';
export * from './keys';
export * from './signers';
export * from './cache';
export { DebugLogger } from './utils/DebugLogger';
export * from './IdentityEnv';
export * from './utils/bytes';
export * from './utils/did';
export * from './utils/sessionScopes';
export * from './testHelpers';

// Note: Web-specific functionality (IdentityKitWeb, LocalStorageKeyStore, etc.) 
// is available via the '/web' export path to ensure proper browser environment detection

