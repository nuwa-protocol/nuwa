import { randomUUID } from 'crypto';
import jwt from 'jsonwebtoken';
import { randomBytes } from 'crypto';
import {
  verifyAuthenticationResponse,
  VerifiedAuthenticationResponse,
} from '@simplewebauthn/server';
import { PublicKeyCredentialJSON, AuthenticationResponseJSON } from '@simplewebauthn/types';
import { DidKeyCodec, algorithmToKeyType, KEY_TYPE } from 'nuwa-identity-kit';
import { p256 } from '@noble/curves/p256';
import { ChallengeResponse, VerifyResponse } from '@cadop-shared';

/** In-memory challenge map for dev; clear periodically */
const challengeMap = new Map<string, { nonce: string; ts: number }>();

// 5 minutes expiration
const CHALLENGE_EXPIRATION_MS = 5 * 60 * 1000;

export interface IdpServiceConfig {
  cadopDid: string;
  signingKey: string;
}

export class IdpService {
  private config: IdpServiceConfig;

  constructor(config: IdpServiceConfig) {
    this.config = config;
  }

  /** Generate WebAuthn challenge */
  generateChallenge(): ChallengeResponse {
    // Generate random challenge
    const challengeBytes = randomBytes(32);
    const challenge = Buffer.from(challengeBytes).toString('base64url');

    // Generate nonce for tracking
    const nonce = randomUUID();

    // Store challenge with nonce
    challengeMap.set(challenge, { nonce, ts: Date.now() });

    // Clean up expired challenges
    this.cleanupChallenges();

    return {
      challenge,
      nonce,
    };
  }

  /** Clean up expired challenges */
  private cleanupChallenges(): void {
    const now = Date.now();
    for (const [challenge, data] of challengeMap.entries()) {
      if (now - data.ts > CHALLENGE_EXPIRATION_MS) {
        challengeMap.delete(challenge);
      }
    }
  }

  /**
   * Issue ID token
   */
  private issueIdToken(userDid: string, nonce: string): VerifyResponse {
    const now = Math.floor(Date.now() / 1000);
    const payload = {
      iss: this.config.cadopDid,
      sub: userDid,
      aud: this.config.cadopDid,
      exp: now + 3600,
      iat: now,
      jti: randomUUID(),
      nonce,
    };

    const idToken = jwt.sign(payload, this.config.signingKey);
    return { idToken };
  }

  /**
   * Convert raw public key bytes to COSE_Key format for WebAuthn verification
   * This is a manual implementation that doesn't rely on external CBOR libraries
   *
   * @param rawPubKey Raw public key bytes (Ed25519: 32 bytes, P-256: 33 bytes compressed)
   * @param keyType Key type from DidKeyCodec.parseDidKey
   * @returns COSE_Key formatted bytes as Uint8Array
   */
  private rawPubKeyToCOSE(rawPubKey: Uint8Array, keyType: string): Uint8Array {
    if (keyType === KEY_TYPE.ED25519) {
      if (rawPubKey.length !== 32) {
        throw new Error(`Invalid Ed25519 key length: ${rawPubKey.length}`);
      }

      // Manually construct CBOR for OKP Ed25519 key
      // Format: {1: 1, 3: -8, -1: 6, -2: <public key bytes>}

      // CBOR encoding for a map with 4 pairs
      const header = Buffer.from([0xa4]);

      // Key 1 (kty) : Value 1 (OKP)
      const kty = Buffer.from([0x01, 0x01]);

      // Key 3 (alg) : Value -8 (EdDSA)
      // -8 is encoded as 0x27 in CBOR (negative integer)
      const alg = Buffer.from([0x03, 0x27]);

      // Key -1 (crv) : Value 6 (Ed25519)
      // -1 is encoded as 0x20 in CBOR
      const crv = Buffer.from([0x20, 0x06]);

      // Key -2 (x) : Value <public key bytes>
      // -2 is encoded as 0x21 in CBOR
      // For byte strings, we need a byte string header
      // 0x58 is byte string with 1-byte length
      // 0x20 is length 32 in hex
      const xHeader = Buffer.from([0x21, 0x58, 0x20]);

      // Combine all parts
      return Buffer.concat([header, kty, alg, crv, xHeader, Buffer.from(rawPubKey)]);
    } else if (keyType === KEY_TYPE.ECDSAR1) {
      if (rawPubKey.length !== 33) {
        throw new Error(`Invalid P-256 compressed key length: ${rawPubKey.length}`);
      }

      try {
        // uncompress p256 public key
        const point = p256.ProjectivePoint.fromHex(rawPubKey);
        const uncompressed = point.toRawBytes(false); // false = uncompressed format

        // extract x and y coordinates (each 32 bytes)
        const x = uncompressed.slice(1, 33); // skip 0x04 prefix
        const y = uncompressed.slice(33, 65);

        console.log('P-256 key decompression:', {
          compressedLength: rawPubKey.length,
          uncompressedLength: uncompressed.length,
          xLength: x.length,
          yLength: y.length,
        });

        // manually construct COSE Key (EC2 P-256)
        // format: {1: 2, 3: -7, -1: 1, -2: <x-coord>, -3: <y-coord>}

        // CBOR encoding, Map has 5 key-value pairs
        const header = Buffer.from([0xa5]);

        // Key 1 (kty) : Value 2 (EC2)
        const kty = Buffer.from([0x01, 0x02]);

        // Key 3 (alg) : Value -7 (ES256)
        // -7 encoded as 0x26
        const alg = Buffer.from([0x03, 0x26]);

        // Key -1 (crv) : Value 1 (P-256)
        // -1 encoded as 0x20
        const crv = Buffer.from([0x20, 0x01]);

        // Key -2 (x) : Value <x-coordinate bytes>
        // -2 encoded as 0x21
        // 0x58 represents byte string, followed by 1 byte length
        // 0x20 = 32 in hex
        const xHeader = Buffer.from([0x21, 0x58, 0x20]);

        // Key -3 (y) : Value <y-coordinate bytes>
        // -3 encoded as 0x22
        const yHeader = Buffer.from([0x22, 0x58, 0x20]);

        // combine all parts
        return Buffer.concat([
          header,
          kty,
          alg,
          crv,
          xHeader,
          Buffer.from(x),
          yHeader,
          Buffer.from(y),
        ]);
      } catch (error) {
        console.error('P-256 key decompression error:', error);
        throw new Error(
          `P-256 key decompression failed: ${error instanceof Error ? error.message : String(error)}`
        );
      }
    } else {
      throw new Error(`Unsupported key type: ${keyType}`);
    }
  }

  /**
   * Verify WebAuthn assertion
   */
  async verifyAssertion(
    assertion: PublicKeyCredentialJSON,
    userDid: string,
    nonce: string,
    rpId: string,
    origin: string
  ): Promise<VerifyResponse> {
    if (!assertion || !userDid || !nonce) {
      throw new Error('assertion, userDid and nonce are required');
    }

    try {
      // Parse the assertion
      const authResponse = assertion as unknown as AuthenticationResponseJSON;

      // Extract challenge from clientDataJSON
      const clientDataJSON = JSON.parse(
        Buffer.from(authResponse.response.clientDataJSON, 'base64url').toString()
      );
      const responseChallenge = clientDataJSON.challenge;

      // Verify challenge exists and matches nonce
      const challengeData = challengeMap.get(responseChallenge);
      if (!challengeData) {
        throw new Error('invalid or expired challenge');
      }

      if (challengeData.nonce !== nonce) {
        throw new Error('nonce mismatch');
      }

      // Extract public key from userDid
      const { keyType, publicKey } = DidKeyCodec.parseDidKey(userDid);

      try {
        // Log for debugging
        console.log('Public key details:', {
          keyType,
          publicKeyLength: publicKey.length,
          publicKeyHex: Buffer.from(publicKey).toString('hex').substring(0, 32) + '...',
        });

        // Convert raw public key to COSE_Key format
        let cosePublicKey: Uint8Array;
        try {
          cosePublicKey = this.rawPubKeyToCOSE(publicKey, keyType);
          console.log('COSE public key created:', {
            coseKeyLength: cosePublicKey.length,
            coseKeyHex: Buffer.from(cosePublicKey).toString('hex').substring(0, 32) + '...',
          });
        } catch (coseError) {
          console.error('COSE key creation error:', coseError);
          throw new Error(
            `Failed to create COSE key: ${coseError instanceof Error ? coseError.message : String(coseError)}`
          );
        }

        // Verify the authentication response
        const verification = await verifyAuthenticationResponse({
          response: authResponse,
          expectedChallenge: responseChallenge,
          expectedOrigin: [origin],
          expectedRPID: rpId,
          credential: {
            id: authResponse.id,
            publicKey: cosePublicKey, // Use COSE encoded public key
            counter: 0,
          },
          requireUserVerification: false,
        });

        if (!verification.verified) {
          throw new Error('authentication verification failed');
        }

        // Remove used challenge
        challengeMap.delete(responseChallenge);

        // Issue ID token
        return this.issueIdToken(userDid, nonce);
      } catch (error) {
        console.error(
          'Verification error details:',
          error instanceof Error
            ? { name: error.name, message: error.message, stack: error.stack }
            : JSON.stringify(error, null, 2)
        );
        throw new Error(
          `Verification error: ${error instanceof Error ? error.message : JSON.stringify(error)}`
        );
      }
    } catch (error) {
      console.error(
        'Assertion processing error:',
        error instanceof Error
          ? { name: error.name, message: error.message, stack: error.stack }
          : JSON.stringify(error, null, 2)
      );
      throw error;
    }
  }
}
