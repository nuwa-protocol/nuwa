import { Base64 } from 'js-base64';
import type { DIDDocument, SignerInterface, VerificationMethod } from '@nuwa-ai/identity-kit';
import { MultibaseCodec, DidKeyCodec, KeyType, KEY_TYPE, toKeyType } from '@nuwa-ai/identity-kit';
import {
  SignatureScheme,
  Signer,
  Authenticator,
  Transaction,
  Ed25519PublicKey,
  Secp256k1PublicKey,
  PublicKey,
  Address,
  BitcoinAddress,
  RoochAddress,
  Bytes,
  bcs,
  PublicKeyInitData,
  fromB64,
  WebAuthnSigner as RoochWebAuthnSigner,
  WebAuthnAssertionData,
} from '@roochnetwork/rooch-sdk';
import { defaultCryptoProviderFactory } from '@nuwa-ai/identity-kit';
import { p256 } from '@noble/curves/p256';
import { PublicKeyUtils } from '../crypto/PublicKeyUtils';

// 临时复制自 rooch-sdk/src/crypto/signatureScheme.ts，待 SDK 更新后可删除
const SIGNATURE_SCHEME_TO_FLAG = {
  ED25519: 0x00,
  Secp256k1: 0x01,
  EcdsaR1: 0x02,
} as const;

export enum BuiltinAuthValidator {
  SESSION = 0x00,
  BITCOIN = 0x01,
  BITCOIN_MULTISIG = 0x02,
  WEBAUTHN = 0x03,
}

export class WebauthnAuthPayload {
  scheme: number;
  signature: Uint8Array;
  public_key: Uint8Array;
  authenticator_data: Uint8Array;
  client_data_json: Uint8Array;

  constructor(
    scheme: number,
    signature: Uint8Array,
    public_key: Uint8Array,
    authenticator_data: Uint8Array,
    client_data_json: Uint8Array
  ) {
    this.scheme = scheme;
    this.signature = signature;
    this.public_key = public_key;
    this.authenticator_data = authenticator_data;
    this.client_data_json = client_data_json;
  }

  encode(): Bytes {
    return WebauthnAuthPayloadSchema.serialize({
      scheme: this.scheme,
      signature: this.signature,
      public_key: this.public_key,
      authenticator_data: this.authenticator_data,
      client_data_json: this.client_data_json,
    }).toBytes();
  }
}

export const WebauthnAuthPayloadSchema = bcs.struct('WebauthnAuthPayload', {
  scheme: bcs.u8(),
  signature: bcs.vector(bcs.u8()),
  public_key: bcs.vector(bcs.u8()),
  authenticator_data: bcs.vector(bcs.u8()),
  client_data_json: bcs.vector(bcs.u8()),
});

//TODO migrate this to rooch-sdk
export class WebAuthnAuthenticator {
  readonly authValidatorId: number;
  readonly payload: Bytes;

  private constructor(authValidatorId: number, payload: Bytes) {
    this.authValidatorId = authValidatorId;
    this.payload = payload;
  }

  encode(): Bytes {
    return bcs.Authenticator.serialize({
      authValidatorId: this.authValidatorId,
      payload: this.payload,
    }).toBytes();
  }

  static async webauthn(input: Bytes, signer: Signer): Promise<WebAuthnAuthenticator> {
    if (!(signer instanceof WebAuthnSigner)) {
      throw new Error('Signer must be a WebAuthnSigner');
    }
    const authenticator = new WebAuthnAuthenticator(BuiltinAuthValidator.WEBAUTHN, input);
    return authenticator;
  }
}

export class EcdsaR1PublicKey extends PublicKey<Address> {
  static SIZE = 33;

  private readonly data: Uint8Array;

  /**
   * Create a new EcdsaR1PublicKey object
   * @param value ecdsa r1 public key as buffer or base-64 encoded string
   */
  constructor(value: PublicKeyInitData) {
    super();

    if (typeof value === 'string') {
      this.data = fromB64(value);
    } else if (value instanceof Uint8Array) {
      this.data = value;
    } else {
      this.data = Uint8Array.from(value);
    }

    if (this.data.length !== EcdsaR1PublicKey.SIZE) {
      throw new Error(
        `Invalid public key input. Expected ${EcdsaR1PublicKey.SIZE} bytes, got ${this.data.length}`
      );
    }
  }

  /**
   * Checks if two Ed25519 public keys are equal
   */
  override equals(publicKey: EcdsaR1PublicKey): boolean {
    return super.equals(publicKey);
  }

  /**
   * Return the byte array representation of the EcdsaR1 public key
   */
  toBytes(): Uint8Array {
    return this.data;
  }

  /**
   * Return the Rooch address associated with this EcdsaR1 public key
   */
  flag(): number {
    return SIGNATURE_SCHEME_TO_FLAG.EcdsaR1;
  }

  /**
   * Verifies that the signature is valid for the provided message
   */
  async verify(message: Uint8Array, signature: Uint8Array): Promise<boolean> {
    throw new Error('ECDSA R1 verification is not supported');
  }

  /**
   * Return the Rooch address associated with this Ed25519 public key
   */
  toAddress(): RoochAddress {
    throw new Error('ECDSA R1 address is not supported');
  }
}

interface WebAuthnSignature {
  response: AuthenticatorAssertionResponse;
  signature: Uint8Array;
  rawSignature: Uint8Array;
  authenticatorData: Uint8Array;
  clientDataJSON: Uint8Array;
}

interface WebAuthnSignerOptions {
  rpId?: string;
  rpName?: string;
  didDocument: DIDDocument;
  credentialId?: string;
}

export class WebAuthnSigner extends RoochWebAuthnSigner implements SignerInterface {
  private did: string;
  private rpId: string;
  private rpName: string;
  private didDocument: DIDDocument;
  private passkeyAuthMethod: VerificationMethod;
  private credentialId?: string;
  private didAddress: RoochAddress;

  constructor(did: string, options: WebAuthnSignerOptions) {
    super();
    this.did = did;
    this.rpId = options.rpId || window.location.hostname;
    this.rpName = options.rpName || 'CADOP';
    this.didDocument = options.didDocument;
    this.credentialId = options.credentialId;
    let passkeyAuthMethod = this.findPasskeyAuthMethod();
    if (!passkeyAuthMethod) {
      throw new Error('No passkey authentication method found');
    }
    this.passkeyAuthMethod = passkeyAuthMethod;
    const didParts = this.did.split(':');
    this.didAddress = new RoochAddress(didParts[2]);
  }

  private findPasskeyAuthMethod(): VerificationMethod | null {
    if (!this.didDocument?.controller || !this.didDocument?.authentication) {
      return null;
    }

    const controller = this.didDocument.controller[0];

    if (!controller.startsWith('did:key:')) {
      return null;
    }

    const { publicKey: controllerPublicKey } = DidKeyCodec.parseDidKey(controller);
    const verificationMethod = this.didDocument.verificationMethod || [];
    for (const authMethod of verificationMethod) {
      if (authMethod.publicKeyMultibase) {
        try {
          let authPublicKeyBytes = MultibaseCodec.decodeBase58btc(authMethod.publicKeyMultibase);
          // compare public keys
          if (this.arePublicKeysEqual(controllerPublicKey, authPublicKeyBytes)) {
            return authMethod;
          }
        } catch (error) {
          console.warn(`Failed to parse authentication method: ${authMethod.id}`, error);
          continue;
        }
      }
    }

    return null;
  }

  private arePublicKeysEqual(key1: Uint8Array, key2: Uint8Array): boolean {
    if (key1.length !== key2.length) {
      return false;
    }
    return key1.every((value, index) => value === key2[index]);
  }

  async signWithKeyId(data: Uint8Array, keyId: string): Promise<Uint8Array> {
    const { signature, authenticatorData: _ } = await this.signWithWebAuthn(data, keyId);
    return signature;
  }

  async signAssertion(data: Uint8Array): Promise<AuthenticatorAssertionResponse> {
    const { response, signature, authenticatorData, clientDataJSON } = await this.signWithWebAuthn(
      data,
      this.passkeyAuthMethod?.id
    );
    return response;
  }

  async signWithWebAuthn(data: Uint8Array, keyId: string): Promise<WebAuthnSignature> {
    if (keyId !== this.passkeyAuthMethod?.id) {
      throw new Error('Only passkey authentication method is supported');
    }

    try {
      const options = await this.getAssertionOptions(data);

      const assertion = (await navigator.credentials.get({
        publicKey: options,
      })) as PublicKeyCredential;

      if (!assertion) {
        throw new Error('No assertion received');
      }

      const response = assertion.response as AuthenticatorAssertionResponse;
      console.log('signWithWebAuthn', { data, keyId, response });

      let signature = new Uint8Array(response.signature);
      const authenticatorData = new Uint8Array(response.authenticatorData);
      const clientDataJSON = new Uint8Array(response.clientDataJSON);
      const clientDataHash = await crypto.subtle.digest('SHA-256', response.clientDataJSON);

      // 构造验证数据
      const dataToVerify = new Uint8Array(authenticatorData.length + clientDataHash.byteLength);
      dataToVerify.set(authenticatorData, 0);
      dataToVerify.set(new Uint8Array(clientDataHash), authenticatorData.length);

      // 获取公钥
      const keyInfo = await this.getKeyInfo(keyId);
      if (!keyInfo) {
        throw new Error('Public key not found');
      }

      // 从 DID 文档中获取公钥
      const webauthnPublicKey = this.passkeyAuthMethod?.publicKeyMultibase;
      if (!webauthnPublicKey) {
        throw new Error('Public key not found in DID document');
      }

      // 解码 Base58 格式的公钥
      const publicKeyBytes = MultibaseCodec.decodeBase58btc(webauthnPublicKey);

      // 使用 CryptoUtils 验证签名（支持多曲线）
      const isSupported = defaultCryptoProviderFactory.supports(keyInfo.type);
      if (!isSupported) {
        throw new Error('Unsupported key type');
      }
      let rawSignature = this.derToRaw(signature);
      // Convert canonicalized raw signature back to DER for WebCrypto
      const lowSDERSignature = p256.Signature.fromCompact(rawSignature).toDERRawBytes();

      const derCanonical = rawToDerCanonical(rawSignature);

      // Use low-S DER for WebCrypto verification (native APIs require canonical form)
      let isValidByWebCrypto = await verifyByWebCrypto(publicKeyBytes, derCanonical, dataToVerify);
      let isValidByP256 = await verifyByP256(publicKeyBytes, rawSignature, dataToVerify);

      console.log('Signature verification:', {
        isValidByWebCrypto,
        isValidByP256,
        clientDataJSON,
        authenticatorData: Base64.fromUint8Array(authenticatorData),
        signature: Base64.fromUint8Array(signature),
        rawSignature: Base64.fromUint8Array(rawSignature),
        lowSDERSignature: Base64.fromUint8Array(lowSDERSignature),
        derCanonical: Base64.fromUint8Array(derCanonical),
        dataToVerify: Base64.fromUint8Array(dataToVerify),
        publicKey: Base64.fromUint8Array(publicKeyBytes),
        keyType: keyInfo.type,
        webauthnPublicKey,
        publicKeyLength: publicKeyBytes.length,
        signatureLength: signature.length,
      });

      return {
        response,
        signature,
        rawSignature,
        authenticatorData,
        clientDataJSON,
      };
    } catch (error) {
      console.error('WebAuthn signing failed:', error);
      throw error;
    }
  }

  async canSignWithKeyId(keyId: string): Promise<boolean> {
    if (keyId !== this.passkeyAuthMethod?.id) {
      return false;
    }

    try {
      if (!window.PublicKeyCredential) {
        return false;
      }

      const available = await PublicKeyCredential.isUserVerifyingPlatformAuthenticatorAvailable();
      return available;
    } catch (error) {
      console.error('Failed to check WebAuthn availability:', error);
      return false;
    }
  }

  async getDid(): Promise<string> {
    return this.did;
  }

  // SignerInterface methods
  getDID(): string {
    return this.did;
  }

  // Note: getPublicKeyBytes removed - use getKeyInfo() from IdentityKit SignerInterface instead

  getAlgorithm(): string {
    return this.passkeyAuthMethod.type || 'unknown';
  }

  async isAvailable(): Promise<boolean> {
    try {
      if (!window.PublicKeyCredential) {
        return false;
      }
      return await PublicKeyCredential.isUserVerifyingPlatformAuthenticatorAvailable();
    } catch (error) {
      console.error('Failed to check WebAuthn availability:', error);
      return false;
    }
  }

  async getKeyInfo(keyId: string): Promise<
    | {
        type: KeyType;
        publicKey: Uint8Array;
      }
    | undefined
  > {
    if (!this.passkeyAuthMethod || keyId !== this.passkeyAuthMethod.id) {
      throw new Error('Invalid key ID or passkey authentication method not found');
    }

    if (!this.passkeyAuthMethod.publicKeyMultibase) {
      throw new Error('Public key not found');
    }
    let canonicalKeyType = toKeyType(this.passkeyAuthMethod.type);
    return {
      type: canonicalKeyType,
      publicKey: MultibaseCodec.decodeBase58btc(this.passkeyAuthMethod.publicKeyMultibase),
    };
  }

  async listKeyIds(): Promise<string[]> {
    if (!this.passkeyAuthMethod) {
      return [];
    }
    return [this.passkeyAuthMethod.id];
  }

  private async getAssertionOptions(data: Uint8Array): Promise<PublicKeyCredentialRequestOptions> {
    return {
      challenge: data,
      rpId: this.rpId,
      allowCredentials: this.credentialId
        ? [{ id: Base64.toUint8Array(this.credentialId), type: 'public-key' }]
        : [],
      userVerification: 'preferred',
      timeout: 60000,
    };
  }

  //======= Rooch Signer =======
  async sign(data: Uint8Array): Promise<Uint8Array> {
    if (!this.passkeyAuthMethod) {
      throw new Error('No passkey authentication method found');
    }
    return this.signWithKeyId(data, this.passkeyAuthMethod?.id);
  }

  private async buildAuthenticatorPayload(sig: WebAuthnSignature): Promise<Bytes> {
    const schemeFlag = 2;

    const payload = new WebauthnAuthPayload(
      schemeFlag,
      sig.rawSignature,
      this.getPublicKey().toBytes(),
      sig.authenticatorData,
      sig.clientDataJSON
    );
    let clientData = JSON.parse(new TextDecoder().decode(sig.clientDataJSON));
    console.log('client_data:', clientData);
    // Log detailed data for Move test case
    console.log('=== WebAuthn Test Data for Move Test Case ===');
    console.log(
      'authenticator_data_hex:',
      Array.from(sig.authenticatorData)
        .map(b => b.toString(16).padStart(2, '0'))
        .join('')
    );
    console.log(
      'client_data_json_hex:',
      Array.from(sig.clientDataJSON)
        .map(b => b.toString(16).padStart(2, '0'))
        .join('')
    );
    console.log(
      'signature_der_hex:',
      Array.from(sig.signature)
        .map(b => b.toString(16).padStart(2, '0'))
        .join('')
    );
    console.log(
      'signature_raw_hex:',
      Array.from(sig.rawSignature)
        .map(b => b.toString(16).padStart(2, '0'))
        .join('')
    );
    console.log(
      'public_key_compressed_hex:',
      Array.from(this.getPublicKey().toBytes())
        .map(b => b.toString(16).padStart(2, '0'))
        .join('')
    );

    // Compute client data hash
    const clientDataHashBuffer = await crypto.subtle.digest('SHA-256', sig.clientDataJSON);
    const clientDataHash = new Uint8Array(clientDataHashBuffer);
    console.log(
      'client_data_hash_hex:',
      Array.from(clientDataHash)
        .map(b => b.toString(16).padStart(2, '0'))
        .join('')
    );

    // Compute verification message (authenticatorData || SHA-256(clientDataJSON))
    const verificationMessage = new Uint8Array(
      sig.authenticatorData.length + clientDataHash.length
    );
    verificationMessage.set(sig.authenticatorData, 0);
    verificationMessage.set(clientDataHash, sig.authenticatorData.length);
    console.log(
      'verification_message_hex:',
      Array.from(verificationMessage)
        .map(b => b.toString(16).padStart(2, '0'))
        .join('')
    );

    // Log BCS payload
    const payloadBytes = payload.encode();
    console.log(
      'bcs_payload_hex:',
      Array.from(payloadBytes)
        .map(b => b.toString(16).padStart(2, '0'))
        .join('')
    );
    console.log('=== End WebAuthn Test Data ===');

    return payloadBytes;
  }

  async signTransaction(tx: Transaction): Promise<Authenticator> {
    const txHash = tx.hashData();

    const vmFragment = this.passkeyAuthMethod.id.split('#')[1];
    const webauthnAuth = await Authenticator.didWebAuthn(txHash, this, vmFragment);

    tx.setAuth(webauthnAuth);
    tx.setSender(this.didAddress);
    return webauthnAuth;
  }

  getKeyScheme(): SignatureScheme {
    return this.passkeyAuthMethod.type === KEY_TYPE.SECP256K1 ? 'Secp256k1' : 'ED25519';
  }

  getPublicKey(): PublicKey<Address> {
    let publicKey = MultibaseCodec.decodeBase58btc(this.passkeyAuthMethod.publicKeyMultibase!);
    if (this.passkeyAuthMethod.type === KEY_TYPE.SECP256K1) {
      return new Secp256k1PublicKey(publicKey);
    } else if (this.passkeyAuthMethod.type === KEY_TYPE.ECDSAR1) {
      return new EcdsaR1PublicKey(publicKey);
    } else if (this.passkeyAuthMethod.type === KEY_TYPE.ED25519) {
      return new Ed25519PublicKey(publicKey);
    } else {
      throw new Error('Unsupported key type');
    }
  }

  getBitcoinAddress(): BitcoinAddress {
    throw new Error('Bitcoin address is not supported');
  }

  getRoochAddress(): RoochAddress {
    return this.didAddress;
  }

  private derToRaw(der: Uint8Array): Uint8Array {
    // Expect DER sequence: 0x30 len 0x02 lenR R 0x02 lenS S
    let offset = 0;
    if (der[offset++] !== 0x30) throw new Error('Invalid DER');
    const seqLen = der[offset++];
    if (seqLen + 2 !== der.length) {
      // length byte could be multi-byte but for 70-72 len it's fine
    }
    if (der[offset++] !== 0x02) throw new Error('Invalid DER');
    const rLen = der[offset++];
    let r = der.slice(offset, offset + rLen);
    offset += rLen;
    if (der[offset++] !== 0x02) throw new Error('Invalid DER');
    const sLen = der[offset++];
    let s = der.slice(offset, offset + sLen);

    // Strip leading zero padding
    if (r.length === 33 && r[0] === 0x00) {
      r = r.slice(1);
    }
    if (s.length === 33 && s[0] === 0x00) {
      s = s.slice(1);
    }

    // === Canonicalize S to low-S form ===
    const SECP256R1_N = BigInt(
      '0xffffffff00000000ffffffffffffffffbce6faada7179e84f3b9cac2fc632551'
    );
    const HALF_N = SECP256R1_N >> BigInt(1);
    let sBig = BigInt(
      '0x' +
        Array.from(s)
          .map(b => b.toString(16).padStart(2, '0'))
          .join('')
    );
    if (sBig > HALF_N) {
      sBig = SECP256R1_N - sBig;
      // convert back to bytes (big-endian, no 0x prefix)
      let sHex = sBig.toString(16);
      if (sHex.length % 2 === 1) sHex = '0' + sHex;
      s = new Uint8Array(sHex.match(/.{1,2}/g)!.map(byte => parseInt(byte, 16)));
    }
    // Pad to 32 bytes
    const rPad = new Uint8Array(32);
    rPad.set(r, 32 - r.length);
    const sPad = new Uint8Array(32);
    sPad.set(s, 32 - s.length);

    const raw = new Uint8Array(64);
    raw.set(rPad, 0);
    raw.set(sPad, 32);
    return raw;
  }
}

async function verifyByWebCrypto(
  publicKey: Uint8Array,
  signature: Uint8Array,
  message: Uint8Array
): Promise<boolean> {
  let uncompressed: Uint8Array;
  if (publicKey.length === 65 && publicKey[0] === 0x04) {
    uncompressed = publicKey;
  } else if (publicKey.length === 33) {
    uncompressed = PublicKeyUtils.decompressP256PublicKey(publicKey);
  } else {
    throw new Error('Invalid P-256 public key length');
  }

  // Convert to JWK (Base64URL without padding)
  const toB64Url = (bytes: Uint8Array) => {
    return btoa(String.fromCharCode(...bytes))
      .replace(/\+/g, '-')
      .replace(/\//g, '_')
      .replace(/=+$/, '');
  };
  const x = toB64Url(uncompressed.slice(1, 33));
  const y = toB64Url(uncompressed.slice(33, 65));

  console.log('WebCrypto JWK params:', { x, y });

  const jwk: JsonWebKey = {
    kty: 'EC',
    crv: 'P-256',
    x,
    y,
    ext: true,
  };

  const cryptoKey = await crypto.subtle.importKey(
    'jwk',
    jwk,
    { name: 'ECDSA', namedCurve: 'P-256' },
    false,
    ['verify']
  );

  const ok = await crypto.subtle.verify(
    { name: 'ECDSA', hash: { name: 'SHA-256' } },
    cryptoKey,
    signature,
    message
  );
  return ok;
}

async function verifyByP256(
  publicKey: Uint8Array,
  signature: Uint8Array,
  message: Uint8Array
): Promise<boolean> {
  const digest = new Uint8Array(await crypto.subtle.digest('SHA-256', message));
  // 3. Decompress the public key for Noble.js
  const decompressedKey = PublicKeyUtils.decompressP256PublicKey(publicKey);
  const isValidSignature = p256.verify(signature, digest, decompressedKey);
  return isValidSignature;
}

function rawToDerCanonical(raw: Uint8Array): Uint8Array {
  const toMinimal = (bytes: Uint8Array) => {
    // 去掉所有前导 0x00
    let i = 0;
    while (i < bytes.length - 1 && bytes[i] === 0x00) i++;
    let val = bytes.slice(i);

    // 若最高位为 1，再补一个 0x00
    const needPad = val[0] & 0x80 ? 1 : 0;
    const out = new Uint8Array(2 + needPad + val.length);
    out[0] = 0x02; // INTEGER
    out[1] = val.length + needPad; // length
    if (needPad) out[2] = 0x00;
    out.set(val, 2 + needPad);
    return out;
  };

  const rEnc = toMinimal(raw.slice(0, 32));
  const sEnc = toMinimal(raw.slice(32, 64));

  const der = new Uint8Array(2 + rEnc.length + sEnc.length);
  der[0] = 0x30; // SEQUENCE
  der[1] = rEnc.length + sEnc.length; // total length
  der.set(rEnc, 2);
  der.set(sEnc, 2 + rEnc.length);
  return der;
}
