import * as v1 from './v1';

/**
 * DIDAuth aggregation entry. Each version (v1, v2, …) lives in its own sub-module.
 */
export const DIDAuth = {
  v1,
} as const;

export * from './types';
export default DIDAuth;
