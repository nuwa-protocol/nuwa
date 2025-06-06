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

export type AuthenticatorResponse = RegistrationResponseJSON | AuthenticationResponseJSON;

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