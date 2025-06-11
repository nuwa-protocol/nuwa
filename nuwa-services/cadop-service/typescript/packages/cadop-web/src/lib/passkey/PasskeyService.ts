import { PublicKeyCredentialCreationOptionsJSON, PublicKeyCredentialParameters, PublicKeyCredentialRequestOptionsJSON } from '@simplewebauthn/types';
import { bufferToBase64URLString } from '@simplewebauthn/browser';
import { Base64 } from 'js-base64';
import { DidKeyCodec, KeyType, KEY_TYPE, algorithmToKeyType as algo2key } from 'nuwa-identity-kit';

// key in localStorage for userDid and mapping
const USER_DID_KEY = 'userDid';
const PASSKEY_MAP_KEY = 'passkeyMap'; // JSON string -> { [credentialId:string]: { userUuid: string; userDid: string } }

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

  /** 判断浏览器是否支持 Passkey */
  public async isSupported(): Promise<boolean> {
    return typeof window !== 'undefined' && window.PublicKeyCredential !== undefined &&
      await PublicKeyCredential.isUserVerifyingPlatformAuthenticatorAvailable();
  }

  /** 读取本地 userDid */
  public getUserDid(): string | null {
    return localStorage.getItem(USER_DID_KEY);
  }

  /** 主入口：确保本地已有 Passkey，并返回 userDid */
  public async ensureUser(): Promise<string> {
    const existing = this.getUserDid();
    if (existing) return existing;

    // 若无，则创建新 Passkey
    return this.register();
  }

  /** 创建新 Passkey → userDid */
  private async register(): Promise<string> {
    const challenge = new Uint8Array(32);
    crypto.getRandomValues(challenge);
    const userUuid = self.crypto.randomUUID();
    const userName = "NuwaDID"
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
      console.log('[PasskeyService] create options', options);
    }

    const publicKeyOptions: PublicKeyCredentialCreationOptions = {
      ...options,
      challenge: base64URLToArrayBuffer(options.challenge),
      user: {
        ...options.user,
        id: base64URLToArrayBuffer(options.user.id),
      },
    } as unknown as PublicKeyCredentialCreationOptions;

    const cred = await navigator.credentials.create({ publicKey: publicKeyOptions }) as PublicKeyCredential;

    const attRes = cred.response as AuthenticatorAttestationResponse;
    const publicKey = attRes.getPublicKey();
    const alg = attRes.getPublicKeyAlgorithm();
    if (!publicKey) throw new Error('No publicKey from attestation');
    const rawPubKey = extractRawPublicKey(publicKey, alg);
    const keyType = algo2key(alg);
    if (this.developmentMode) {
      console.log('[PasskeyService] PublicKey details', {
        algorithm: alg,
        resolvedKeyType: keyType,
        rawPublicKeyHex: Array.from(rawPubKey).map(b => b.toString(16).padStart(2, '0')).join(''),
      });
    }

    if (!keyType) {
      throw new Error(`Unsupported key algorithm: ${alg}`);
    }
    const userDid = DidKeyCodec.generateDidKey(rawPubKey, keyType);

    // 保存映射
    const map = this.loadMap();
    map[cred.id] = { userUuid, userDid };
    this.saveMap(map);
    localStorage.setItem(USER_DID_KEY, userDid);

    if (this.developmentMode) {
      console.log('[PasskeyService] Registered new passkey', { userDid, credentialId: cred.id });
    }

    return userDid;
  }

  /** 登录：利用 silent mediation 或 allowCredentials 选择 */
  public async login(): Promise<string> {
    const map = this.loadMap();

    const challenge = new Uint8Array(32);
    crypto.getRandomValues(challenge);

    const options: PublicKeyCredentialRequestOptionsJSON = {
      challenge: bufferToBase64URLString(challenge),
      rpId: window.location.hostname,
      userVerification: 'preferred',
      timeout: 60000,
    };

    const publicKeyRequest: PublicKeyCredentialRequestOptions = {
      ...options,
      challenge: base64URLToArrayBuffer(options.challenge),
    } as unknown as PublicKeyCredentialRequestOptions;

    const cred = await navigator.credentials.get({ publicKey: publicKeyRequest, mediation: 'silent' }) as PublicKeyCredential | null;

    if (!cred) throw new Error('No credential from get');

    const entry = map[cred.id];
    if (!entry) throw new Error('Credential not found in local map');

    localStorage.setItem(USER_DID_KEY, entry.userDid);
    return entry.userDid;
  }

  private loadMap(): Record<string, { userUuid: string; userDid: string }> {
    try {
      return JSON.parse(localStorage.getItem(PASSKEY_MAP_KEY) ?? '{}');
    } catch {
      return {};
    }
  }
  private saveMap(map: Record<string, { userUuid: string; userDid: string }>) {
    localStorage.setItem(PASSKEY_MAP_KEY, JSON.stringify(map));
  }

  private base64ToArrayBuffer(base64url: string): ArrayBuffer {
    return base64URLToArrayBuffer(base64url);
  }
} 