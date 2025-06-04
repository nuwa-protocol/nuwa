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

// 统一认证选项
export interface AuthenticationOptions {
  publicKey: PublicKeyCredentialCreationOptionsJSON | PublicKeyCredentialRequestOptionsJSON;
  isNewUser?: boolean;
  user?: {
    did?: string;
    name?: string;
    displayName?: string;
  }
}

// 统一认证结果
export interface AuthenticationResult {
  success: boolean;
  credential?: PublicKeyCredentialDescriptorJSON;
  session?: SessionInfo;
  error?: WebAuthnError;
  isNewUser?: boolean;
}

// 会话信息
export interface SessionInfo {
  session_token: string;
  expires_at: string;
  user: {
    id: string;
    email?: string;
    display_name?: string;
  }
}

// Session 类型
export interface Session {
  id: string;
  session_token: string;
  expires_at: string;
  user: {
    id: string;
    email?: string;
    display_name?: string;
  }
}

// 错误码定义
export enum WebAuthnErrorCode {
  // 基础错误
  NOT_SUPPORTED = 'NOT_SUPPORTED',
  INVALID_STATE = 'INVALID_STATE',
  
  // 注册相关
  REGISTRATION_FAILED = 'REGISTRATION_FAILED',
  DUPLICATE_REGISTRATION = 'DUPLICATE_REGISTRATION',
  
  // 认证相关
  AUTHENTICATION_FAILED = 'AUTHENTICATION_FAILED',
  INVALID_CREDENTIAL = 'INVALID_CREDENTIAL',
  
  // 挑战相关
  INVALID_CHALLENGE = 'INVALID_CHALLENGE',
  CHALLENGE_EXPIRED = 'CHALLENGE_EXPIRED',
  
  // 用户相关
  USER_NOT_FOUND = 'USER_NOT_FOUND',
  USER_CANCELLED = 'USER_CANCELLED',
  
  // 系统错误
  INTERNAL_ERROR = 'INTERNAL_ERROR',
  DATABASE_ERROR = 'DATABASE_ERROR',
  REMOVE_DEVICE_FAILED = 'REMOVE_DEVICE_FAILED'
}

// 凭证信息
export interface CredentialInfo {
  id: string;
  name: string;
  type: string;
  lastUsed: string;
  credentialId: string;
  transports: AuthenticatorTransportFuture[];
} 