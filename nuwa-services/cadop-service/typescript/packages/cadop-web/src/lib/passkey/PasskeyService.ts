import {
  PublicKeyCredentialCreationOptionsJSON,
  PublicKeyCredentialParameters,
  PublicKeyCredentialRequestOptionsJSON,
  PublicKeyCredentialJSON,
  AuthenticatorAssertionResponse,
  AuthenticatorAttestationResponse,
  PublicKeyCredentialRequestOptions,
} from '@simplewebauthn/types';
import { bufferToBase64URLString } from '@simplewebauthn/browser';
import { Base64 } from 'js-base64';
import {
  DidKeyCodec,
  KeyType,
  KEY_TYPE,
  algorithmToKeyType as algo2key,
} from '@nuwa-ai/identity-kit';
import { AuthStore, UserStore } from '../storage';

// Global session flag to avoid multiple register() calls leading to duplicate
// navigator.credentials.create() prompts (e.g., QR code popup on some platforms).
let passkeyAlreadyRegisteredThisSession = false;

// Utils
function arrayBufferToBase64URL(buffer: ArrayBuffer): string {
  return Base64.fromUint8Array(new Uint8Array(buffer), true);
}

function base64URLToArrayBuffer(base64url: string): ArrayBuffer {
  return Base64.toUint8Array(base64url).buffer;
}

// Extract raw public key from SPKI
function extractRawPublicKey(spkiInput: ArrayBuffer | Uint8Array, alg: number): Uint8Array {
  const spki = spkiInput instanceof Uint8Array ? spkiInput : new Uint8Array(spkiInput);
  if (alg === -8) {
    return spki.slice(spki.length - 32);
  }
  if (alg === -7) {
    // uncompressed marker 0x04 followed by x(32) y(32)
    const idx = spki.indexOf(0x04);
    if (idx === -1 || idx + 65 > spki.length) {
      throw new Error('Invalid P-256 SPKI format');
    }
    const x = spki.slice(idx + 1, idx + 33);
    const y = spki.slice(idx + 33, idx + 65);
    const prefix = (y[y.length - 1] & 1) === 0 ? 0x02 : 0x03;
    const compressed = new Uint8Array(33);
    compressed[0] = prefix;
    compressed.set(x, 1);
    return compressed;
  }
  throw new Error(`Unsupported algorithm ${alg}`);
}

export class PasskeyService {
  private developmentMode = import.meta.env.DEV;

  /** Check if browser supports Passkey */
  public async isSupported(): Promise<boolean> {
    return (
      typeof window !== 'undefined' &&
      window.PublicKeyCredential !== undefined &&
      (await PublicKeyCredential.isUserVerifyingPlatformAuthenticatorAvailable())
    );
  }

  /** Get local userDid */
  public getUserDid(): string | null {
    return AuthStore.getCurrentUserDid();
  }

  /** Main entry: ensure local Passkey exists and return userDid */
  public async ensureUser(): Promise<string> {
    const existing = this.getUserDid();
    if (existing) return existing;

    if (passkeyAlreadyRegisteredThisSession) {
      // Prevent re-invoking navigator.credentials.create which could trigger a
      // second QR/passkey dialog in the same tab. Throw so caller can handle.
      throw new Error('Passkey has already been registered in this session');
    }

    passkeyAlreadyRegisteredThisSession = true;
    return this.register();
  }

  /** Create new Passkey → userDid */
  private async register(): Promise<string> {
    const challenge = new Uint8Array(32);
    crypto.getRandomValues(challenge);
    const userUuid = self.crypto.randomUUID();
    const userName = 'NuwaDID';
    const options: PublicKeyCredentialCreationOptionsJSON = {
      challenge: bufferToBase64URLString(challenge),
      rp: {
        name: window.location.hostname,
        id: window.location.hostname,
      },
      user: {
        id: bufferToBase64URLString(new TextEncoder().encode(userUuid)),
        name: userName,
        displayName: userName,
      },
      pubKeyCredParams: [
        { type: 'public-key', alg: -8 }, // Ed25519
        { type: 'public-key', alg: -7 }, // ES256
      ] as PublicKeyCredentialParameters[],
      authenticatorSelection: {
        residentKey: 'required',
        requireResidentKey: true,
        authenticatorAttachment: 'platform',
        userVerification: 'preferred',
      },
      timeout: 60000,
      attestation: 'none',
    };

    if (this.developmentMode) {
      console.log('[PasskeyService] Registration options:', {
        challenge: options.challenge,
        rpId: options.rp.id,
        rpName: options.rp.name,
        userUuid,
        userName,
        currentHostname: window.location.hostname,
        currentOrigin: window.location.origin,
      });
    }

    const publicKeyOptions: PublicKeyCredentialCreationOptions = {
      ...options,
      challenge: base64URLToArrayBuffer(options.challenge),
      user: {
        ...options.user,
        id: base64URLToArrayBuffer(options.user.id),
      },
    } as unknown as PublicKeyCredentialCreationOptions;

    const cred = (await navigator.credentials.create({
      publicKey: publicKeyOptions,
    })) as PublicKeyCredential;

    if (this.developmentMode) {
      console.log('[PasskeyService] Credential created:', {
        credentialId: cred.id,
        credentialIdLength: cred.id.length,
        credentialType: cred.type,
        rawIdLength: cred.rawId?.byteLength,
      });
    }

    const attRes = cred.response as AuthenticatorAttestationResponse;
    const publicKey = attRes.getPublicKey();
    const alg = attRes.getPublicKeyAlgorithm();

    if (this.developmentMode) {
      console.log('[PasskeyService] Attestation response details:', {
        hasPublicKey: !!publicKey,
        publicKeyLength: publicKey?.byteLength,
        algorithm: alg,
        attestationObjectLength: attRes.attestationObject?.byteLength,
        clientDataJSONLength: attRes.clientDataJSON?.byteLength,
      });
    }

    if (!publicKey) throw new Error('No publicKey from attestation');

    // Log SPKI format public key details
    const spkiBytes = new Uint8Array(publicKey);
    if (this.developmentMode) {
      console.log('[PasskeyService] SPKI public key details:', {
        algorithm: alg,
        spkiLength: spkiBytes.length,
        spkiHex: Array.from(spkiBytes)
          .map(b => b.toString(16).padStart(2, '0'))
          .join(''),
        first20Bytes: Array.from(spkiBytes.slice(0, 20))
          .map(b => b.toString(16).padStart(2, '0'))
          .join(' '),
        last20Bytes: Array.from(spkiBytes.slice(-20))
          .map(b => b.toString(16).padStart(2, '0'))
          .join(' '),
      });
    }

    const rawPubKey = extractRawPublicKey(publicKey, alg);

    if (this.developmentMode) {
      console.log('[PasskeyService] Raw public key extracted:', {
        rawLength: rawPubKey.length,
        rawHex: Array.from(rawPubKey)
          .map(b => b.toString(16).padStart(2, '0'))
          .join(''),
        isCompressed: rawPubKey.length === 33 && (rawPubKey[0] === 0x02 || rawPubKey[0] === 0x03),
        compressionFlag: rawPubKey[0]?.toString(16).padStart(2, '0'),
        first8Bytes: Array.from(rawPubKey.slice(0, 8))
          .map(b => b.toString(16).padStart(2, '0'))
          .join(' '),
      });
    }

    const keyType = algo2key(alg);
    if (this.developmentMode) {
      console.log('[PasskeyService] Key type resolution:', {
        algorithm: alg,
        resolvedKeyType: keyType,
        isEd25519: keyType === KEY_TYPE.ED25519,
        isEcdsaR1: keyType === KEY_TYPE.ECDSAR1,
      });
    }

    if (!keyType) {
      throw new Error(`Unsupported key algorithm: ${alg}`);
    }

    const userDid = DidKeyCodec.generateDidKey(rawPubKey, keyType);

    if (this.developmentMode) {
      console.log('[PasskeyService] DID generation:', {
        userDid,
        didLength: userDid.length,
        didPrefix: userDid.substring(0, 20) + '...',
        keyType,
        publicKeyLength: rawPubKey.length,
      });

      // Verify DID roundtrip conversion
      try {
        const { keyType: parsedKeyType, publicKey: parsedPublicKey } =
          DidKeyCodec.parseDidKey(userDid);
        const publicKeyMatches = Array.from(rawPubKey).every(
          (byte, index) => byte === parsedPublicKey[index]
        );

        console.log('[PasskeyService] DID roundtrip verification:', {
          originalKeyType: keyType,
          parsedKeyType: parsedKeyType,
          keyTypeMatches: keyType === parsedKeyType,
          originalPublicKeyHex: Array.from(rawPubKey)
            .map(b => b.toString(16).padStart(2, '0'))
            .join(''),
          parsedPublicKeyHex: Array.from(parsedPublicKey)
            .map(b => b.toString(16).padStart(2, '0'))
            .join(''),
          publicKeyMatches: publicKeyMatches,
          lengthMatch: rawPubKey.length === parsedPublicKey.length,
        });
      } catch (didError) {
        console.error('[PasskeyService] DID parsing failed:', didError);
      }
    }

    // Save credential to user store
    UserStore.addCredential(userDid, cred.id);
    // Set as current user
    AuthStore.setCurrentUserDid(userDid);

    if (this.developmentMode) {
      console.log('[PasskeyService] Registration completed:', {
        userDid,
        credentialId: cred.id,
        credentialIdTruncated: cred.id.substring(0, 20) + '...',
      });
    }

    return userDid;
  }

  /** Login: using silent mediation or allowCredentials selection */
  public async login(options?: { mediation?: CredentialMediationRequirement }): Promise<string> {
    const challenge = new Uint8Array(32);
    crypto.getRandomValues(challenge);

    const requestOptions: PublicKeyCredentialRequestOptionsJSON = {
      challenge: bufferToBase64URLString(challenge),
      rpId: window.location.hostname,
      userVerification: 'preferred',
      timeout: 60000,
    };

    // Gather credential IDs from local store so the authenticator can directly
    // display the matching passkey. Prefer credentials of the current user if
    // we already have a login session, otherwise fall back to all credentials
    // stored on this device.
    let allowCredentialIds: string[] = [];
    const currentUserDid = AuthStore.getCurrentUserDid();
    if (currentUserDid) {
      allowCredentialIds = UserStore.listCredentials(currentUserDid);
    } else {
      for (const did of UserStore.getAllUsers()) {
        allowCredentialIds.push(...UserStore.listCredentials(did));
      }
    }

    const publicKeyRequest: PublicKeyCredentialRequestOptions = {
      ...requestOptions,
      challenge: base64URLToArrayBuffer(requestOptions.challenge),
      ...(allowCredentialIds.length > 0 && {
        allowCredentials: allowCredentialIds.map(id => ({
          id: base64URLToArrayBuffer(id),
          type: 'public-key',
        })),
      }),
    } as unknown as PublicKeyCredentialRequestOptions;

    // Default to 'silent' for automatic login attempts in AuthContext
    // Use 'required' for user-initiated login (always shows UI with available credentials)
    const mediation = options?.mediation || 'silent';

    const cred = (await navigator.credentials.get({
      publicKey: publicKeyRequest,
      mediation,
    })) as PublicKeyCredential | null;

    if (!cred) throw new Error('No credential from get');

    // Resolve user DID by credential ID
    let userDid = UserStore.findUserByCredential(cred.id);
    if (!userDid) {
      throw new Error('Unable to resolve user DID from credential');
    }

    return userDid;
  }

  /**
   * Use this method to authenticate with a challenge from the server
   * @param options WebAuthn request options
   * @returns assertionJSON and userDid
   */
  public async authenticateWithChallenge(options: {
    challenge: string;
    rpId: string | undefined;
    mediation?: CredentialMediationRequirement;
  }): Promise<{
    assertionJSON: PublicKeyCredentialJSON;
    userDid: string;
  }> {
    try {
      // 1. Collect credentials to be sent to the authenticator
      let userDid = this.getUserDid();
      let allowCredentialIds: string[] = [];
      if (userDid) {
        allowCredentialIds = UserStore.listCredentials(userDid);
      } else {
        // If we don't know which user is logging in, enumerate every stored credential
        for (const did of UserStore.getAllUsers()) {
          allowCredentialIds.push(...UserStore.listCredentials(did));
        }
      }

      if (this.developmentMode) {
        console.log('[PasskeyService] authenticateWithChallenge options:', {
          challenge: options.challenge?.substring(0, 20) + '...',
          rpId: options.rpId,
          allowCredentials: allowCredentialIds,
        });
      }

      const rpId = options.rpId ? options.rpId : window.location.hostname;

      const publicKeyRequest: PublicKeyCredentialRequestOptions = {
        challenge: base64URLToArrayBuffer(options.challenge),
        rpId: rpId,
        userVerification: 'preferred',
        timeout: 60000,
        allowCredentials: allowCredentialIds.map(id => ({
          id: base64URLToArrayBuffer(id),
          type: 'public-key',
        })),
      } as unknown as PublicKeyCredentialRequestOptions;

      // call WebAuthn API to get assertion
      const cred = (await navigator.credentials.get({
        publicKey: publicKeyRequest,
        mediation: options.mediation || 'silent',
      })) as PublicKeyCredential | null;

      if (!cred) throw new Error('No credential from get');

      // 2. If we didn't know the user beforehand, resolve it now using the credential ID
      if (!userDid) {
        userDid = UserStore.findUserByCredential(cred.id);
      }
      if (!userDid) {
        throw new Error('Unable to resolve user DID from credential');
      }

      const userHandle = (cred.response as AuthenticatorAssertionResponse).userHandle;
      // convert credential to JSON format
      const assertionJSON: PublicKeyCredentialJSON = {
        id: cred.id,
        rawId: arrayBufferToBase64URL(cred.rawId),
        type: 'public-key',
        response: {
          authenticatorData: arrayBufferToBase64URL(
            (cred.response as AuthenticatorAssertionResponse).authenticatorData
          ),
          clientDataJSON: arrayBufferToBase64URL(cred.response.clientDataJSON),
          signature: arrayBufferToBase64URL(
            (cred.response as AuthenticatorAssertionResponse).signature
          ),
          userHandle: userHandle ? arrayBufferToBase64URL(userHandle) : undefined,
        },
        clientExtensionResults: cred.getClientExtensionResults(),
      };

      if (this.developmentMode) {
        console.log('[PasskeyService] authenticateWithChallenge result:', {
          credId: assertionJSON.id.substring(0, 20) + '...',
          userDid: userDid,
        });
      }

      return { assertionJSON, userDid } as {
        assertionJSON: PublicKeyCredentialJSON;
        userDid: string;
      };
    } catch (error) {
      if (this.developmentMode) {
        console.error(
          '[PasskeyService] authenticateWithChallenge error:',
          error instanceof Error
            ? { name: error.name, message: error.message, stack: error.stack }
            : typeof error === 'object'
              ? JSON.stringify(error, null, 2)
              : error
        );
      }
      throw error;
    }
  }
}
