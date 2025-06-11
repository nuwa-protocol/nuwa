import { Base64, isValid } from 'js-base64';
import type { DIDDocument, SignerInterface, VerificationMethod } from 'nuwa-identity-kit';
import { BaseMultibaseCodec, DidKeyCodec, KeyType, KEY_TYPE, toKeyType } from 'nuwa-identity-kit';
import { SignatureScheme, Signer, Authenticator, Transaction, Ed25519PublicKey, Secp256k1PublicKey, PublicKey, Address, BitcoinAddress, RoochAddress, Bytes, bcs, PublicKeyInitData, fromB64 } from '@roochnetwork/rooch-sdk';
import { CryptoUtils, defaultCryptoProviderFactory } from 'nuwa-identity-kit';

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

  constructor(scheme: number, signature: Uint8Array, public_key: Uint8Array, authenticator_data: Uint8Array, client_data_json: Uint8Array) {
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
    }).toBytes()
  }
}

export const WebauthnAuthPayloadSchema = bcs.struct('WebauthnAuthPayload', {
  scheme: bcs.u8(),
  signature: bcs.vector(bcs.u8()),
  public_key: bcs.vector(bcs.u8()),
  authenticator_data: bcs.vector(bcs.u8()),
  client_data_json: bcs.vector(bcs.u8()),
})

//TODO migrate this to rooch-sdk
export class WebAuthnAuthenticator{
  readonly authValidatorId: number
  readonly payload: Bytes

  private constructor(authValidatorId: number, payload: Bytes) {
    this.authValidatorId = authValidatorId
    this.payload = payload
  }

  encode(): Bytes {
    return bcs.Authenticator.serialize({
      authValidatorId: this.authValidatorId,
      payload: this.payload,
    }).toBytes()
  }

  static async webauthn(input: Bytes, signer: Signer): Promise<WebAuthnAuthenticator> {
    if(!(signer instanceof WebAuthnSigner)) {
      throw new Error('Signer must be a WebAuthnSigner');
    }
    const authenticator = new WebAuthnAuthenticator(BuiltinAuthValidator.WEBAUTHN, input);
    return authenticator;
  }
}

export class EcdsaR1PublicKey extends PublicKey<Address> {
  static SIZE = 33

  private readonly data: Uint8Array

  /**
   * Create a new EcdsaR1PublicKey object
   * @param value ecdsa r1 public key as buffer or base-64 encoded string
   */
  constructor(value: PublicKeyInitData) {
    super()

    if (typeof value === 'string') {
      this.data = fromB64(value)
    } else if (value instanceof Uint8Array) {
      this.data = value
    } else {
      this.data = Uint8Array.from(value)
    }

    if (this.data.length !== EcdsaR1PublicKey.SIZE) {
      throw new Error(
        `Invalid public key input. Expected ${EcdsaR1PublicKey.SIZE} bytes, got ${this.data.length}`,
      )
    }
  }

  /**
   * Checks if two Ed25519 public keys are equal
   */
  override equals(publicKey: EcdsaR1PublicKey): boolean {
    return super.equals(publicKey)
  }

  /**
   * Return the byte array representation of the EcdsaR1 public key
   */
  toBytes(): Uint8Array {
    return this.data
  }

  /**
   * Return the Rooch address associated with this EcdsaR1 public key
   */
  flag(): number {
    return SIGNATURE_SCHEME_TO_FLAG.EcdsaR1
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
  signature: Uint8Array;
  authenticatorData: Uint8Array;
  clientDataJSON: Uint8Array;
}

interface WebAuthnSignerOptions {
  rpId?: string;
  rpName?: string;
  didDocument: DIDDocument;
  credentialId?: string;
}

export class WebAuthnSigner extends Signer implements SignerInterface {
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
          let authPublicKeyBytes = BaseMultibaseCodec.decodeBase58btc(authMethod.publicKeyMultibase);
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
    const { signature, authenticatorData:_ } = await this.signWithWebAuthn(data, keyId);
    return signature;
  }

  async signWithWebAuthn(data: Uint8Array, keyId: string): Promise<WebAuthnSignature> {
    if (keyId !== this.passkeyAuthMethod?.id) {
      throw new Error('Only passkey authentication method is supported');
    }

    try {
      const options = await this.getAssertionOptions(data);
      
      const assertion = await navigator.credentials.get({
        publicKey: options
      }) as PublicKeyCredential;

      if (!assertion) {
        throw new Error('No assertion received');
      }

      const response = assertion.response as AuthenticatorAssertionResponse;
      console.log('signWithWebAuthn', {data, keyId, response});
      
      const signature = new Uint8Array(response.signature);
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
      const publicKeyBytes = BaseMultibaseCodec.decodeBase58btc(webauthnPublicKey);
      
      // 使用 CryptoUtils 验证签名（支持多曲线）
      const isSupported = defaultCryptoProviderFactory.supports(keyInfo.type);
      let isValid = false;
      if (!isSupported) {
        throw new Error('Unsupported key type');
      } 

      try {
        isValid = await CryptoUtils.verify(
          dataToVerify,
          signature,
          publicKeyBytes,
          keyInfo.type,
        );
      } catch (e) {
        console.warn('CryptoUtils verify error', e);
      }

      console.log('Signature verification:', {
        isValid,
        clientDataJSON,
        authenticatorData: Base64.fromUint8Array(authenticatorData),
        signature: Base64.fromUint8Array(signature),
        dataToVerify: Base64.fromUint8Array(dataToVerify),
        publicKey: Base64.fromUint8Array(publicKeyBytes),
        keyType: keyInfo.type,
        webauthnPublicKey,
        publicKeyLength: publicKeyBytes.length,
        signatureLength: signature.length
      });

      return {
        signature,
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

  getDid(): string {
    return this.did;
  }

  async getKeyInfo(keyId: string): Promise<{
    type: KeyType;
    publicKey: Uint8Array;
  } | undefined> {
    if (!this.passkeyAuthMethod || keyId !== this.passkeyAuthMethod.id) {
      throw new Error('Invalid key ID or passkey authentication method not found');
    }

    if (!this.passkeyAuthMethod.publicKeyMultibase) {
      throw new Error('Public key not found');
    }
    let canonicalKeyType = toKeyType(this.passkeyAuthMethod.type);
    return {
      type: canonicalKeyType,
      publicKey: BaseMultibaseCodec.decodeBase58btc(this.passkeyAuthMethod.publicKeyMultibase)
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
      allowCredentials: this.credentialId ? [{ id: Base64.toUint8Array(this.credentialId), type: 'public-key' }] : [],
      userVerification: 'preferred',
      timeout: 60000
    };
  }

  //======= Rooch Signer =======
  async sign(data: Uint8Array): Promise<Uint8Array> {
    if (!this.passkeyAuthMethod) {
      throw new Error('No passkey authentication method found');
    }
    return this.signWithKeyId(data, this.passkeyAuthMethod?.id);
  }

  private buildAuthenticatorPayload(sig: WebAuthnSignature): Bytes {
    const schemeFlag = SIGNATURE_SCHEME_TO_FLAG[this.getKeyScheme()];

    const payload = new WebauthnAuthPayload(
      schemeFlag,
      sig.signature,
      this.getPublicKey().toBytes(),
      sig.authenticatorData,
      sig.clientDataJSON,
    );

    return payload.encode();
  }

  async signTransaction(tx: Transaction): Promise<Authenticator> {
    // 使用交易哈希作为 WebAuthn challenge
    const txHash = tx.hashData();
    
    // 进行 WebAuthn 签名
    const sig = await this.signWithWebAuthn(txHash, this.passkeyAuthMethod.id);

    // 构造 payload
    const payloadBytes = this.buildAuthenticatorPayload(sig);

    // 构造 Authenticator 对象
    const webauthnAuth = (await WebAuthnAuthenticator.webauthn(
      payloadBytes,
      this,
    )) as unknown as Authenticator;

    // 设置到交易中（便于调用方）
    tx.setAuth(webauthnAuth);
    tx.setSender(this.didAddress);
    return webauthnAuth;
  }

  getKeyScheme(): SignatureScheme {
    return this.passkeyAuthMethod.type === KEY_TYPE.SECP256K1 ? 'Secp256k1' : 'ED25519';
  }

  getPublicKey(): PublicKey<Address> {
    let publicKey = BaseMultibaseCodec.decodeBase58btc(this.passkeyAuthMethod.publicKeyMultibase!);
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
  
} 