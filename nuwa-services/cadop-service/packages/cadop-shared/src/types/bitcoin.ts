/**
 * Bitcoin authentication types
 */

export type AuthProvider = 'webauthn' | 'bitcoin';

export interface BitcoinVerifyRequest {
  address: string;
  publicKeyHex: string;
  signature: string;
  challenge: string;
  nonce: string;
  origin?: string;
}

export interface BitcoinChallengeResponse {
  challenge: string;
  nonce: string;
  rpId?: string; // For WebAuthn
  messageToSign?: string; // For Bitcoin
}

export interface BitcoinVerifyResponse {
  idToken: string;
  isNewUser?: boolean;
}

export interface ExtendedIDTokenPayload {
  iss: string; // Issuer (IdP's DID)
  sub: string; // Subject (controller DID)
  aud: string; // Audience (Custodian's DID)
  exp: number; // Expiration time
  iat: number; // Issued at time
  jti: string; // JWT ID
  nonce: string; // Prevent replay

  // Extended claims for multi-wallet support
  provider: AuthProvider; // Authentication provider
  controllerPublicKeyMultibase?: string; // Controller's public key in multibase format
  controllerVMType?: string; // Controller's verification method type
  origin?: string; // Origin domain
}
