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
} from '@simplewebauthn/types';

// Database types for authenticators
export interface Authenticator {
  id: string;
  user_id: string;
  credential_id: Buffer;
  credential_public_key: Buffer;
  counter: number;
  credential_device_type: 'singleDevice' | 'multiDevice';
  credential_backed_up: boolean;
  transports: AuthenticatorTransportFuture[];
  friendly_name?: string;
  aaguid?: string;
  last_used_at?: Date;
  created_at: Date;
  updated_at: Date;
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
}

// Service response types
export interface WebAuthnRegistrationResult {
  success: boolean;
  authenticator?: {
    id: string;
    friendly_name?: string | undefined;
    credential_id: string;
    created_at: Date;
    transports: AuthenticatorTransportFuture[];
  };
  error?: string;
  details?: any;
}

export interface WebAuthnAuthenticationResult {
  success: boolean;
  user_id?: string;
  authenticator_id?: string;
  error?: string;
  details?: any;
}

// Configuration types
export interface WebAuthnConfig {
  rp_name: string;
  rp_id: string;
  origin: string;
  challenge_timeout: number; // in milliseconds
  expected_origin: string;
  expected_rp_id: string;
}

// Error types
export class WebAuthnError extends Error {
  constructor(
    message: string,
    public code: string,
    public details?: any
  ) {
    super(message);
    this.name = 'WebAuthnError';
  }
}

// Utility types
export type AuthenticatorTransport = 'usb' | 'nfc' | 'ble' | 'internal' | 'hybrid';

export interface CreateAuthenticatorData {
  user_id: string;
  credential_id: Buffer;
  credential_public_key: Buffer;
  counter: number;
  credential_device_type: 'singleDevice' | 'multiDevice';
  credential_backed_up: boolean;
  transports: AuthenticatorTransportFuture[];
  friendly_name?: string | undefined;
  aaguid?: string | undefined;
}

export interface UpdateAuthenticatorData {
  counter?: number;
  last_used_at?: Date | undefined;
  friendly_name?: string | undefined;
}

export interface WebAuthnDeviceInfo {
  id: string;
  friendly_name?: string | undefined;
  created_at: Date;
  last_used_at?: Date | undefined;
  transports: AuthenticatorTransportFuture[];
  device_type: 'singleDevice' | 'multiDevice';
  backed_up: boolean;
} 