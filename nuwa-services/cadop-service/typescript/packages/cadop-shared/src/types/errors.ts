// Error types
export class CadopError extends Error {
    constructor(
      message: string,
      public code: CadopErrorCode,
      public details?: any
    ) {
      super(message);
      this.name = 'CadopError';
    }
  }


// Error code definition
export enum CadopErrorCode {
    // Basic error
    NOT_SUPPORTED = 'NOT_SUPPORTED',
    INVALID_STATE = 'INVALID_STATE',
    VALIDATION_ERROR = 'VALIDATION_ERROR',
    NOT_FOUND = 'NOT_FOUND',
    
    // Registration related
    REGISTRATION_FAILED = 'REGISTRATION_FAILED',
    DUPLICATE_REGISTRATION = 'DUPLICATE_REGISTRATION',
    
    // Authentication related
    AUTHENTICATION_FAILED = 'AUTHENTICATION_FAILED',
    INVALID_CREDENTIAL = 'INVALID_CREDENTIAL',
    AUTHENTICATOR_NOT_FOUND = 'AUTHENTICATOR_NOT_FOUND',
    
    // Challenge related
    INVALID_CHALLENGE = 'INVALID_CHALLENGE',
    CHALLENGE_EXPIRED = 'CHALLENGE_EXPIRED',
    
    // User related
    USER_NOT_FOUND = 'USER_NOT_FOUND',
    USER_CANCELLED = 'USER_CANCELLED',
    
    // System error
    INTERNAL_ERROR = 'INTERNAL_ERROR',
    DATABASE_ERROR = 'DATABASE_ERROR',
    REMOVE_DEVICE_FAILED = 'REMOVE_DEVICE_FAILED',
    
    // Token related errors
    TOKEN_EXPIRED = 'TOKEN_EXPIRED',
    TOKEN_INVALID_SIGNATURE = 'TOKEN_INVALID_SIGNATURE',
    TOKEN_INVALID_AUDIENCE = 'TOKEN_INVALID_AUDIENCE',
    TOKEN_INVALID_ISSUER = 'TOKEN_INVALID_ISSUER',
    TOKEN_INVALID_CLAIMS = 'TOKEN_INVALID_CLAIMS',
    TOKEN_PUBLIC_KEY_MISMATCH = 'TOKEN_PUBLIC_KEY_MISMATCH'
}