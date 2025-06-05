import type {
  GenerateRegistrationOptionsOpts,
  GenerateAuthenticationOptionsOpts,
  VerifyRegistrationResponseOpts,
  VerifyAuthenticationResponseOpts,
} from '@simplewebauthn/server';

import type {
  RegistrationResponseJSON,
  AuthenticationResponseJSON,
  AuthenticatorTransportFuture,
  PublicKeyCredentialCreationOptionsJSON,
  PublicKeyCredentialRequestOptionsJSON,
  PublicKeyCredentialDescriptorFuture,
  PublicKeyCredentialRequestOptions,
  PublicKeyCredential,
  PublicKeyCredentialDescriptorJSON,
} from '@simplewebauthn/types';

// Database types for authenticators
export interface Authenticator {
  id: string;
  userId: string;
  credentialId: string;  // base64url encoded string
  credentialPublicKey: Buffer;
  counter: number;
  credentialDeviceType: 'singleDevice' | 'multiDevice';
  credentialBackedUp: boolean;
  transports: AuthenticatorTransportFuture[];
  friendlyName?: string;
  aaguid?: string;
  lastUsedAt?: Date;
  createdAt: Date;
  updatedAt: Date;
}

// Database types for WebAuthn challenges
export interface WebAuthnChallenge {
  id: string;
  user_id?: string;
  challenge: Buffer;
  operation_type: 'registration' | 'authentication';
  client_data: Record<string, any>;
  expires_at: Date;
  used_at?: Date;
  created_at: Date;
}

// API request/response types
export interface WebAuthnRegistrationOptions {
  challenge: string;
  rp: {
    name: string;
    id: string;
  };
  user: {
    id: string;
    name: string;
    displayName: string;
  };
  pubKeyCredParams: Array<{
    alg: number;
    type: 'public-key';
  }>;
  authenticatorSelection?: {
    authenticatorAttachment?: 'platform' | 'cross-platform';
    userVerification?: 'required' | 'preferred' | 'discouraged';
    residentKey?: 'discouraged' | 'preferred' | 'required';
  };
  attestation?: 'none' | 'indirect' | 'direct' | 'enterprise';
  excludeCredentials?: Array<{
    id: string;
    type: 'public-key';
    transports?: AuthenticatorTransportFuture[];
  }>;
  timeout?: number;
}

export interface WebAuthnAuthenticationOptions {
  challenge: string;
  timeout?: number;
  rpId?: string;
  allowCredentials?: Array<{
    id: string;
    type: 'public-key';
    transports?: AuthenticatorTransportFuture[];
  }>;
  userVerification?: 'required' | 'preferred' | 'discouraged';
}

export interface WebAuthnRegistrationRequest {
  options: WebAuthnRegistrationOptions;
  friendly_name?: string;
}

export interface WebAuthnRegistrationResponse {
  id: string;
  rawId: string;
  response: {
    attestationObject: string;
    clientDataJSON: string;
    transports?: AuthenticatorTransportFuture[];
  };
  type: 'public-key';
  clientExtensionResults: Record<string, any>;
  authenticatorAttachment?: 'platform' | 'cross-platform';
}

export interface WebAuthnAuthenticationRequest {
  options: WebAuthnAuthenticationOptions;
}

export interface WebAuthnAuthenticationResponse {
  id: string;
  rawId: string;
  response: {
    authenticatorData: string;
    clientDataJSON: string;
    signature: string;
    userHandle?: string;
  };
  type: 'public-key';
  clientExtensionResults: Record<string, any>;
  authenticatorAttachment?: 'platform' | 'cross-platform';
  authenticatorInfo?: {
    userAgent: string;
    platform: string;
    isVirtualAuthenticator: boolean;
  };
}

// Service response types
export interface WebAuthnRegistrationResult {
  success: boolean;
  authenticator?: {
    id: string;
    friendlyName?: string | undefined;
    credentialId: string;
    createdAt: Date;
    transports: AuthenticatorTransportFuture[];
  };
  error?: string;
  details?: any;
}

export interface WebAuthnAuthenticationResult {
  success: boolean;
  userId?: string;
  authenticatorId?: string;
  error?: string;
  details?: any;
  session?: {
    session_token: string;
    expires_at: string;
    user: {
      id: string;
      email?: string;
      display_name?: string;
    }
  }
}

// Configuration types
export interface WebAuthnConfig {
  rpName: string;
  rpID: string;
  origin: string;
  timeout: number;
  attestationType: 'none' | 'indirect' | 'direct';
}

// Error types
export class WebAuthnError extends Error {
  constructor(
    message: string,
    public code: WebAuthnErrorCode,
    public details?: any
  ) {
    super(message);
    this.name = 'WebAuthnError';
  }
}

// Utility types
export type AuthenticatorTransport = 'usb' | 'nfc' | 'ble' | 'internal' | 'hybrid';

// Database input type for creating authenticator
export interface CreateAuthenticatorData {
  userId: string;
  credentialId: string;
  credentialPublicKey: Buffer | Uint8Array;
  counter: number;
  credentialDeviceType: string;
  credentialBackedUp: boolean;
  transports?: AuthenticatorTransportFuture[];
  friendlyName?: string;
}

// Database input type for updating authenticator
export interface UpdateAuthenticatorData {
  id: string;
  counter: number;
  lastUsedAt: Date;
}

export interface WebAuthnDeviceInfo {
  id: string;
  name: string;
  type: string;
  lastUsed: string;
}

export type {
  GenerateRegistrationOptionsOpts,
  GenerateAuthenticationOptionsOpts,
  VerifyRegistrationResponseOpts,
  VerifyAuthenticationResponseOpts,
  RegistrationResponseJSON,
  AuthenticationResponseJSON,
  PublicKeyCredentialCreationOptionsJSON,
  PublicKeyCredentialRequestOptionsJSON,
  PublicKeyCredentialDescriptorFuture,
};

// API response types
export interface WebAuthnOptionsResponse {
  success: boolean;
  options: PublicKeyCredentialCreationOptionsJSON | PublicKeyCredentialRequestOptionsJSON;
  isRegistration: boolean;
}

// Unify authentication options
export interface AuthenticationOptions {
  publicKey: PublicKeyCredentialCreationOptionsJSON | PublicKeyCredentialRequestOptionsJSON;
  isNewUser?: boolean;
  user?: {
    did?: string;
    name?: string;
    displayName?: string;
  }
}

// Authentication result
export interface AuthenticationResult {
  success: boolean;
  credential?: PublicKeyCredentialDescriptorJSON;
  session?: Session;
  error?: WebAuthnError;
  isNewUser?: boolean;
}

// Session type
export interface Session {
  id: string;
  session_token: string;
  expires_at: string;
  user: {
    id: string;
    user_did: string;
    sybil_level: number;
    email?: string;
    display_name?: string;
  }
}

// Error code definition
export enum WebAuthnErrorCode {
  // Basic error
  NOT_SUPPORTED = 'NOT_SUPPORTED',
  INVALID_STATE = 'INVALID_STATE',
  
  // Registration related
  REGISTRATION_FAILED = 'REGISTRATION_FAILED',
  DUPLICATE_REGISTRATION = 'DUPLICATE_REGISTRATION',
  
  // Authentication related
  AUTHENTICATION_FAILED = 'AUTHENTICATION_FAILED',
  INVALID_CREDENTIAL = 'INVALID_CREDENTIAL',
  
  // Challenge related
  INVALID_CHALLENGE = 'INVALID_CHALLENGE',
  CHALLENGE_EXPIRED = 'CHALLENGE_EXPIRED',
  
  // User related
  USER_NOT_FOUND = 'USER_NOT_FOUND',
  USER_CANCELLED = 'USER_CANCELLED',
  
  // System error
  INTERNAL_ERROR = 'INTERNAL_ERROR',
  DATABASE_ERROR = 'DATABASE_ERROR',
  REMOVE_DEVICE_FAILED = 'REMOVE_DEVICE_FAILED'
}

// Credential information
export interface CredentialInfo {
  id: string;
  name: string;
  type: string;
  lastUsed: string;
  credentialId: string;
  transports: AuthenticatorTransportFuture[];
} 