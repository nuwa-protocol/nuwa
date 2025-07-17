/**
 * Test helpers for Rooch DID integration testing
 * 
 * This module provides utilities to simplify DID-related integration tests
 * by abstracting away the complexity of on-chain DID creation and management.
 * 
 * @module testHelpers
 * @example
 * ```ts
 * import { TestEnv, createSelfDid, createCadopDid } from '@nuwa-ai/identity-kit/testHelpers';
 * 
 * if (TestEnv.skipIfNoNode()) return;
 * 
 * const env = await TestEnv.bootstrap();
 * const { did, keyManager } = await createSelfDid(env);
 * ```
 */

export * from './env';
export * from './rooch';
export * from './didFactory';
export * from './types';

// Re-export key classes and functions for convenience
export { TestEnv } from './env';
export { createSelfDid, createCadopCustodian, createDidViaCadop } from './didFactory'; 