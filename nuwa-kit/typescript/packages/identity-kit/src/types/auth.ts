// Authentication and signature related types

/**
 * As per NIP-1 Signature Structure Specification
 */
export interface SignedData {
  operation: string;
  params: Record<string, any>;
  nonce: string;
  timestamp: number; // Unix timestamp
}

export interface NIP1Signature {
  signer_did: string;
  key_id: string; // The id of the verificationMethod used for signing
  value: Uint8Array; // The signature value
}

export interface NIP1SignedObject {
  signed_data: SignedData;
  signature: NIP1Signature;
}

/**
 * Authentication methods enumeration for CADOP services
 */
export enum AuthMethod {
  GoogleOAuth = 1,
  TwitterOAuth = 2,
  AppleSignIn = 3,
  GitHubOAuth = 4,
  EmailOTP = 5,
  SMSOTP = 6,
  WeChatQR = 7,
  DiscordOAuth = 8,
  // 10+ reserved for future versions
}

/**
 * Sybil resistance levels for CADOP
 */
export enum SybilLevel {
  None = 0, // No specific verification
  EmailBasic = 1, // Email or basic Web2 OAuth
  PhoneNumber = 2, // Phone number verification
  GovernmentID = 3, // Government ID or strong biometric
}

/**
 * OIDC ID Token claims required for CADOP
 */
export interface CadopIdTokenClaims {
  iss: string; // Issuer identifier
  sub: string; // Subject (user's DID, typically did:key)
  aud: string; // Audience (custodian DID)
  exp: number; // Expiration time
  iat: number; // Issued at time
  jti: string; // JWT ID (unique identifier)
  nonce: string; // Nonce from state parameter
  pub_jwk: JsonWebKey; // Public key in JWK format
  sybil_level: SybilLevel; // Sybil resistance level
} 