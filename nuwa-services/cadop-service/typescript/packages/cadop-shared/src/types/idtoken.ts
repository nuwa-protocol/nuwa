export interface IDTokenPayload {
    iss: string;      // Issuer (IdP's DID)
    sub: string;      // Subject (user's DID)
    aud: string;      // Audience (Custodian's DID)
    exp: number;      // Expiration time
    iat: number;      // Issued at time
    jti: string;      // JWT ID
    nonce: string;    // Prevent replay
    pub_jwk: JsonWebKey;  // User's public key
    sybil_level: number;  // Sybil resistance level
}

// ID Token
export interface IDToken {
  id_token: string;
}

/**
 * Challenge response from IdP service
 */
export interface ChallengeResponse {
  challenge: string;  // Base64URL-encoded challenge bytes
  rpId: string;       // Relying party ID
  nonce: string;      // UUID for tracking and anti-replay
}