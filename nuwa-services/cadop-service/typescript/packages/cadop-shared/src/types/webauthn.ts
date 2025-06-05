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

import type { Session } from './session.js';
import type { CadopError } from './errors.js';

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
  user: {
    id: string;
    userDid: string;
  }
}

// Authentication result
export interface AuthenticationResult {
  success: boolean;
  credential?: PublicKeyCredentialDescriptorJSON;
  session?: Session;
  error?: CadopError;
  isNewUser?: boolean;
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