/**
 * Unified error handling for IdentityKit
 */

/**
 * Error codes for IdentityKit operations
 */
export enum IdentityKitErrorCode {
  // Configuration and initialization
  INVALID_CONFIGURATION = 'INVALID_CONFIGURATION',
  ENVIRONMENT_NOT_SUPPORTED = 'ENVIRONMENT_NOT_SUPPORTED',
  INITIALIZATION_FAILED = 'INITIALIZATION_FAILED',
  
  // DID operations
  DID_NOT_FOUND = 'DID_NOT_FOUND',
  DID_INVALID_FORMAT = 'DID_INVALID_FORMAT',
  DID_METHOD_NOT_SUPPORTED = 'DID_METHOD_NOT_SUPPORTED',
  DID_CREATION_FAILED = 'DID_CREATION_FAILED',
  DID_RESOLUTION_FAILED = 'DID_RESOLUTION_FAILED',
  
  // VDR (Verifiable Data Registry) operations
  VDR_NOT_AVAILABLE = 'VDR_NOT_AVAILABLE',
  VDR_OPERATION_FAILED = 'VDR_OPERATION_FAILED',
  VDR_NETWORK_ERROR = 'VDR_NETWORK_ERROR',
  VDR_INVALID_RESPONSE = 'VDR_INVALID_RESPONSE',
  
  // Key management
  KEY_NOT_FOUND = 'KEY_NOT_FOUND',
  KEY_INVALID_FORMAT = 'KEY_INVALID_FORMAT',
  KEY_GENERATION_FAILED = 'KEY_GENERATION_FAILED',
  KEY_IMPORT_FAILED = 'KEY_IMPORT_FAILED',
  KEY_STORAGE_ERROR = 'KEY_STORAGE_ERROR',
  KEY_PERMISSION_DENIED = 'KEY_PERMISSION_DENIED',
  
  // Signing operations
  SIGNING_FAILED = 'SIGNING_FAILED',
  SIGNATURE_VERIFICATION_FAILED = 'SIGNATURE_VERIFICATION_FAILED',
  SIGNER_NOT_AVAILABLE = 'SIGNER_NOT_AVAILABLE',
  
  // Authentication (from existing AuthErrorCode)
  AUTH_INVALID_HEADER = 'AUTH_INVALID_HEADER',
  AUTH_INVALID_BASE64 = 'AUTH_INVALID_BASE64',
  AUTH_INVALID_JSON = 'AUTH_INVALID_JSON',
  AUTH_MISSING_SIGNATURE = 'AUTH_MISSING_SIGNATURE',
  AUTH_TIMESTAMP_OUT_OF_WINDOW = 'AUTH_TIMESTAMP_OUT_OF_WINDOW',
  AUTH_NONCE_REPLAYED = 'AUTH_NONCE_REPLAYED',
  AUTH_DID_DOCUMENT_NOT_FOUND = 'AUTH_DID_DOCUMENT_NOT_FOUND',
  AUTH_VERIFICATION_METHOD_NOT_FOUND = 'AUTH_VERIFICATION_METHOD_NOT_FOUND',
  AUTH_INVALID_PUBLIC_KEY = 'AUTH_INVALID_PUBLIC_KEY',
  AUTH_DID_MISMATCH = 'AUTH_DID_MISMATCH',
  
  // Web-specific operations
  WEB_BROWSER_NOT_SUPPORTED = 'WEB_BROWSER_NOT_SUPPORTED',
  WEB_STORAGE_NOT_AVAILABLE = 'WEB_STORAGE_NOT_AVAILABLE',
  WEB_DEEPLINK_FAILED = 'WEB_DEEPLINK_FAILED',
  WEB_CADOP_CONNECTION_FAILED = 'WEB_CADOP_CONNECTION_FAILED',
  WEB_OAUTH_CALLBACK_FAILED = 'WEB_OAUTH_CALLBACK_FAILED',
  
  // React-specific operations
  REACT_NOT_AVAILABLE = 'REACT_NOT_AVAILABLE',
  REACT_HOOK_MISUSE = 'REACT_HOOK_MISUSE',
  
  // Generic errors
  OPERATION_NOT_SUPPORTED = 'OPERATION_NOT_SUPPORTED',
  INVALID_PARAMETER = 'INVALID_PARAMETER',
  INTERNAL_ERROR = 'INTERNAL_ERROR',
  NETWORK_ERROR = 'NETWORK_ERROR',
  TIMEOUT_ERROR = 'TIMEOUT_ERROR',
}

/**
 * Base error class for all IdentityKit errors
 */
export class IdentityKitError extends Error {
  public readonly code: IdentityKitErrorCode;
  public readonly category: string;
  public readonly details?: unknown;
  public readonly cause?: Error;

  constructor(
    code: IdentityKitErrorCode,
    message: string,
    options?: {
      category?: string;
      details?: unknown;
      cause?: Error;
    }
  ) {
    super(message);
    this.name = 'IdentityKitError';
    this.code = code;
    this.category = options?.category || this.inferCategory(code);
    this.details = options?.details;
    this.cause = options?.cause;

    // Maintain proper stack trace
    if (Error.captureStackTrace) {
      Error.captureStackTrace(this, this.constructor);
    }

    // Chain the original error stack if available
    if (options?.cause) {
      this.stack = `${this.stack}\nCaused by: ${options.cause.stack}`;
    }
  }

  /**
   * Infer error category from error code
   */
  private inferCategory(code: IdentityKitErrorCode): string {
    if (code.startsWith('AUTH_')) return 'authentication';
    if (code.startsWith('DID_')) return 'did';
    if (code.startsWith('VDR_')) return 'vdr';
    if (code.startsWith('KEY_')) return 'key-management';
    if (code.startsWith('WEB_')) return 'web';
    if (code.startsWith('REACT_')) return 'react';
    if (code.includes('SIGNING') || code.includes('SIGNATURE')) return 'signing';
    if (code.includes('NETWORK')) return 'network';
    return 'general';
  }

  /**
   * Convert to a plain object for serialization
   */
  toJSON(): {
    name: string;
    code: string;
    category: string;
    message: string;
    details?: unknown;
    stack?: string;
  } {
    return {
      name: this.name,
      code: this.code,
      category: this.category,
      message: this.message,
      details: this.details,
      stack: this.stack,
    };
  }

  /**
   * Get a user-friendly error message with suggestions
   */
  getUserMessage(): string {
    const suggestions = this.getSuggestions();
    let message = this.message;
    
    if (suggestions.length > 0) {
      message += '\n\nSuggestions:\n' + suggestions.map(s => `• ${s}`).join('\n');
    }
    
    return message;
  }

  /**
   * Get contextual suggestions based on error code
   */
  private getSuggestions(): string[] {
    switch (this.code) {
      case IdentityKitErrorCode.WEB_BROWSER_NOT_SUPPORTED:
        return [
          'Use a modern browser that supports required Web APIs',
          'Check if you\'re running in a browser environment',
        ];
        
      case IdentityKitErrorCode.WEB_STORAGE_NOT_AVAILABLE:
        return [
          'Enable localStorage or IndexedDB in your browser',
          'Check if you\'re in private/incognito mode',
          'Consider using memory storage as fallback',
        ];
        
      case IdentityKitErrorCode.DID_METHOD_NOT_SUPPORTED:
        return [
          'Check if the DID method is registered with VDRRegistry',
          'Verify the DID format is correct',
        ];
        
      case IdentityKitErrorCode.VDR_NETWORK_ERROR:
        return [
          'Check your network connection',
          'Verify the RPC URL is correct and accessible',
          'Check if the VDR service is running',
        ];
        
      case IdentityKitErrorCode.KEY_STORAGE_ERROR:
        return [
          'Check browser storage permissions',
          'Verify storage quota is not exceeded',
          'Try clearing browser storage and retry',
        ];
        
      case IdentityKitErrorCode.REACT_NOT_AVAILABLE:
        return [
          'Ensure React is properly installed and imported',
          'Check if you\'re using the hook in a React component',
        ];
        
      default:
        return [];
    }
  }
}

/**
 * Factory functions for creating specific error types
 */

export function createConfigurationError(
  message: string,
  details?: unknown,
  cause?: Error
): IdentityKitError {
  return new IdentityKitError(
    IdentityKitErrorCode.INVALID_CONFIGURATION,
    message,
    { category: 'configuration', details, cause }
  );
}

export function createDIDError(
  code: IdentityKitErrorCode,
  message: string,
  details?: unknown,
  cause?: Error
): IdentityKitError {
  return new IdentityKitError(code, message, {
    category: 'did',
    details,
    cause,
  });
}

export function createVDRError(
  code: IdentityKitErrorCode,
  message: string,
  details?: unknown,
  cause?: Error
): IdentityKitError {
  return new IdentityKitError(code, message, {
    category: 'vdr',
    details,
    cause,
  });
}

export function createKeyManagementError(
  code: IdentityKitErrorCode,
  message: string,
  details?: unknown,
  cause?: Error
): IdentityKitError {
  return new IdentityKitError(code, message, {
    category: 'key-management',
    details,
    cause,
  });
}

export function createAuthenticationError(
  code: IdentityKitErrorCode,
  message: string,
  details?: unknown,
  cause?: Error
): IdentityKitError {
  return new IdentityKitError(code, message, {
    category: 'authentication',
    details,
    cause,
  });
}

export function createWebError(
  code: IdentityKitErrorCode,
  message: string,
  details?: unknown,
  cause?: Error
): IdentityKitError {
  return new IdentityKitError(code, message, {
    category: 'web',
    details,
    cause,
  });
}

export function createReactError(
  code: IdentityKitErrorCode,
  message: string,
  details?: unknown,
  cause?: Error
): IdentityKitError {
  return new IdentityKitError(code, message, {
    category: 'react',
    details,
    cause,
  });
}

/**
 * Wrap unknown errors into IdentityKitError
 */
export function wrapUnknownError(
  error: unknown,
  context: string,
  code: IdentityKitErrorCode = IdentityKitErrorCode.INTERNAL_ERROR
): IdentityKitError {
  const originalError = error instanceof Error ? error : new Error(String(error));
  
  return new IdentityKitError(
    code,
    `${context}: ${originalError.message}`,
    {
      cause: originalError,
      details: { context },
    }
  );
}

/**
 * Type guard to check if an error is an IdentityKitError
 */
export function isIdentityKitError(error: unknown): error is IdentityKitError {
  return error instanceof IdentityKitError;
}

/**
 * Legacy compatibility: map old AuthErrorCode to new IdentityKitErrorCode
 */
export const AuthErrorCodeMapping = {
  INVALID_HEADER: IdentityKitErrorCode.AUTH_INVALID_HEADER,
  INVALID_BASE64: IdentityKitErrorCode.AUTH_INVALID_BASE64,
  INVALID_JSON: IdentityKitErrorCode.AUTH_INVALID_JSON,
  MISSING_SIGNATURE: IdentityKitErrorCode.AUTH_MISSING_SIGNATURE,
  TIMESTAMP_OUT_OF_WINDOW: IdentityKitErrorCode.AUTH_TIMESTAMP_OUT_OF_WINDOW,
  NONCE_REPLAYED: IdentityKitErrorCode.AUTH_NONCE_REPLAYED,
  SIGNATURE_VERIFICATION_FAILED: IdentityKitErrorCode.SIGNATURE_VERIFICATION_FAILED,
  DID_DOCUMENT_NOT_FOUND: IdentityKitErrorCode.AUTH_DID_DOCUMENT_NOT_FOUND,
  VERIFICATION_METHOD_NOT_FOUND: IdentityKitErrorCode.AUTH_VERIFICATION_METHOD_NOT_FOUND,
  INVALID_PUBLIC_KEY: IdentityKitErrorCode.AUTH_INVALID_PUBLIC_KEY,
  DID_MISMATCH: IdentityKitErrorCode.AUTH_DID_MISMATCH,
} as const;
