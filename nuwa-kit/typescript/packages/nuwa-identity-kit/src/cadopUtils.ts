import { DIDDocument, VerificationRelationship, CadopIdTokenClaims, CadopOnboardingRequest, KeyType } from './types';
import { CryptoUtils } from './cryptoUtils';

/**
 * CADOP (NIP-3) Utility Functions
 */
export class CadopUtils {
    /**
     * Generates a did:key from a public key in JWK format
     * @param publicKeyJwk The public key in JWK format
     * @returns The generated did:key string
     */
    static async generateDidKeyFromJwk(publicKeyJwk: JsonWebKey): Promise<string> {
      // Convert JWK to multibase format
      const multibasePk = await CryptoUtils.jwkToMultibase(publicKeyJwk);
      return `did:key:${multibasePk}`;
    }
    
    /**
     * Generates a did:key from raw public key bytes
     * @param publicKeyBytes The public key bytes
     * @param keyType The key type (e.g., 'Ed25519VerificationKey2020')
     * @returns The generated did:key string
     */
    static generateDidKeyFromBytes(publicKeyBytes: Uint8Array, keyType: KeyType): string {
      const multibasePk = CryptoUtils.publicKeyToMultibase(publicKeyBytes, keyType);
      return `did:key:${multibasePk}`;
    }
    
    /**
     * Validates the consistency between a did:key and its corresponding public key in JWK format
     * @param didKey The did:key to validate
     * @param publicKeyJwk The public key in JWK format
     * @returns True if the did:key correctly corresponds to the public key
     */
    static async validateDidKeyConsistency(didKey: string, publicKeyJwk: JsonWebKey): Promise<boolean> {
      try {
        const expectedDidKey = await this.generateDidKeyFromJwk(publicKeyJwk);
        return didKey === expectedDidKey;
      } catch (error) {
        console.error('Error validating did:key consistency:', error);
        return false;
      }
    }
    
    /**
     * Creates a basic DID document for a did:key
     * @param didKey The did:key
     * @param publicKeyJwk The public key in JWK format
     * @param keyType The verification method type
     * @param relationships The verification relationships to assign to the key
     * @returns A basic DID document
     */
    static createDidKeyDocument(
      didKey: string, 
      publicKeyJwk: JsonWebKey, 
      keyType: string = 'JsonWebKey2020',
      relationships: VerificationRelationship[] = ['authentication', 'capabilityDelegation']
    ): DIDDocument {
      const keyId = `${didKey}#${didKey.split(':')[2]}`;
      
      const verificationMethod = {
        id: keyId,
        type: keyType,
        controller: didKey,
        publicKeyJwk: publicKeyJwk
      };
      
      const didDocument: DIDDocument = {
        '@context': [
          'https://www.w3.org/ns/did/v1',
          'https://w3id.org/security/suites/jws-2020/v1'
        ],
        id: didKey,
        controller: didKey,
        verificationMethod: [verificationMethod]
      };
      
      // Add the key to specified relationships
      relationships.forEach(rel => {
        if (!didDocument[rel]) {
          didDocument[rel] = [];
        }
        (didDocument[rel] as string[]).push(keyId);
      });
      
      return didDocument;
    }
    
    /**
     * Validates CADOP ID Token claims structure (without signature verification)
     * @param claims The decoded ID token claims
     * @returns True if the claims structure is valid for CADOP
     */
    static validateCadopIdTokenClaims(claims: any): claims is CadopIdTokenClaims {
      // Check required fields
      const requiredFields = ['iss', 'sub', 'aud', 'exp', 'iat', 'jti', 'nonce', 'pub_jwk', 'sybil_level'];
      
      for (const field of requiredFields) {
        if (!(field in claims)) {
          console.error(`Missing required claim: ${field}`);
          return false;
        }
      }
      
      // Validate types
      if (typeof claims.iss !== 'string' ||
          typeof claims.sub !== 'string' ||
          typeof claims.aud !== 'string' ||
          typeof claims.exp !== 'number' ||
          typeof claims.iat !== 'number' ||
          typeof claims.jti !== 'string' ||
          typeof claims.nonce !== 'string' ||
          typeof claims.pub_jwk !== 'object' ||
          typeof claims.sybil_level !== 'number') {
        console.error('Invalid claim types');
        return false;
      }
      
      // Validate sybil_level range
      if (claims.sybil_level < 0 || claims.sybil_level > 3) {
        console.error('Invalid sybil_level range');
        return false;
      }
      
      // Validate that sub is a did:key
      if (!claims.sub.startsWith('did:key:')) {
        console.error('Subject must be a did:key');
        return false;
      }
      
      return true;
    }
    
    /**
     * Validates the consistency between ID token claims (sub and pub_jwk)
     * @param claims The ID token claims
     * @returns True if sub (did:key) matches the pub_jwk
     */
    static async validateIdTokenSubjectKeyConsistency(claims: CadopIdTokenClaims): Promise<boolean> {
      return this.validateDidKeyConsistency(claims.sub, claims.pub_jwk);
    }
    
    /**
     * Checks if an ID token has expired
     * @param claims The ID token claims
     * @param clockSkewSeconds Allowed clock skew in seconds (default: 60)
     * @returns True if the token has expired
     */
    static isIdTokenExpired(claims: CadopIdTokenClaims, clockSkewSeconds: number = 60): boolean {
      const now = Math.floor(Date.now() / 1000);
      return now > (claims.exp + clockSkewSeconds);
    }
    
    /**
     * Checks if an ID token is not yet valid (issued in the future)
     * @param claims The ID token claims
     * @param clockSkewSeconds Allowed clock skew in seconds (default: 60)
     * @returns True if the token is not yet valid
     */
    static isIdTokenNotYetValid(claims: CadopIdTokenClaims, clockSkewSeconds: number = 60): boolean {
      const now = Math.floor(Date.now() / 1000);
      return now < (claims.iat - clockSkewSeconds);
    }
    
    /**
     * Creates a CADOP onboarding request payload
     * @param userDID The user's client-generated DID (typically did:key)
     * @param publicKey The user's public key
     * @param idToken The ID token from the CadopIdPService
     * @param web2ProofAttestations Optional additional VCs from Web2ProofService
     * @returns The CADOP onboarding request payload
     */
    static createCadopOnboardingRequest(
      userDID: string,
      publicKey: JsonWebKey | Uint8Array,
      idToken: string,
      web2ProofAttestations?: string[]
    ): CadopOnboardingRequest {
      return {
        userDID,
        initialAgentKey_pub: publicKey,
        idToken,
        web2ProofAttestations
      };
    }
    
    /**
     * Generates OIDC state parameter for CADOP flow
     * @param custodianDid The DID of the target custodian
     * @param nonce A random nonce for replay protection
     * @param additionalState Optional additional state parameters
     * @returns Base64URL-encoded state parameter
     */
    static generateOidcState(
      custodianDid: string, 
      nonce: string, 
      additionalState?: Record<string, any>
    ): string {
      const stateObject = {
        custodianDid,
        nonce,
        ...additionalState
      };
      
      const stateJson = JSON.stringify(stateObject);
      // Convert to base64url encoding
      return btoa(stateJson).replace(/\+/g, '-').replace(/\//g, '_').replace(/=/g, '');
    }
    
    /**
     * Parses OIDC state parameter for CADOP flow
     * @param state The Base64URL-encoded state parameter
     * @returns The parsed state object
     */
    static parseOidcState(state: string): { custodianDid: string; nonce: string; [key: string]: any } {
      try {
        // Convert from base64url to base64
        const base64 = state.replace(/-/g, '+').replace(/_/g, '/');
        // Add padding if needed
        const padded = base64 + '='.repeat((4 - base64.length % 4) % 4);
        const stateJson = atob(padded);
        return JSON.parse(stateJson);
      } catch (error) {
        throw new Error(`Invalid state parameter: ${error instanceof Error ? error.message : String(error)}`);
      }
    }
  }
  