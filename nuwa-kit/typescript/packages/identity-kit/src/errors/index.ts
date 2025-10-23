/**
 * IdentityKit error handling exports
 */

export {
  IdentityKitError,
  IdentityKitErrorCode,
  createConfigurationError,
  createDIDError,
  createVDRError,
  createKeyManagementError,
  createAuthenticationError,
  createWebError,
  createReactError,
  createCryptoError,
  createMultibaseError,
  createStorageError,
  createValidationError,
  createSignerError,
  createDeepLinkError,
  wrapUnknownError,
  isIdentityKitError,
  AuthErrorCodeMapping,
} from './IdentityKitError';

// Re-export for backward compatibility
export { IdentityKitErrorCode as AuthErrorCode } from './IdentityKitError';
