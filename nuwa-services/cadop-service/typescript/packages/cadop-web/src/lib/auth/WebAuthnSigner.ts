import { Base64 } from 'js-base64';
import type { DIDDocument, SignerInterface, VerificationMethod } from 'nuwa-identity-kit';
import { BaseMultibaseCodec, DidKeyCodec, KeyType, KEY_TYPE, toKeyType } from 'nuwa-identity-kit';

interface WebAuthnSignature {
  signature: Uint8Array;
  authenticatorData: Uint8Array;
}

interface WebAuthnSignerOptions {
  rpId?: string;
  rpName?: string;
  didDocument: DIDDocument;
  credentialId?: string;
}

export class WebAuthnSigner implements SignerInterface {
  private did: string;
  private rpId: string;
  private rpName: string;
  private didDocument: DIDDocument;
  private passkeyAuthMethod: VerificationMethod | null = null;
  private credentialId?: string;

  constructor(did: string, options: WebAuthnSignerOptions) {
    this.did = did;
    this.rpId = options.rpId || window.location.hostname;
    this.rpName = options.rpName || 'CADOP';
    this.didDocument = options.didDocument;
    this.credentialId = options.credentialId;
    this.passkeyAuthMethod = this.findPasskeyAuthMethod();
    if (!this.passkeyAuthMethod) {
      throw new Error('No passkey authentication method found');
    }
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
      const clientDataJSON = new TextDecoder().decode(response.clientDataJSON);
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
      
      // 导入 Ed25519 公钥
      const publicKey = await crypto.subtle.importKey(
        'raw',
        publicKeyBytes,
        {
          name: 'Ed25519',
        },
        true,
        ['verify']
      );

      // 验证签名
      const isValid = await crypto.subtle.verify(
        {
          name: 'Ed25519',
        },
        publicKey,
        signature,
        dataToVerify
      );

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
        authenticatorData
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

    let keyType = toKeyType(this.passkeyAuthMethod.type);

    return {
      type: keyType,
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

  static async getAvailableAuthenticators(): Promise<Array<{
    id: string;
    type: 'platform' | 'cross-platform';
    name: string;
  }>> {
    if (!window.PublicKeyCredential) {
      return [];
    }

    try {
      const available = await PublicKeyCredential.isUserVerifyingPlatformAuthenticatorAvailable();
      if (!available) {
        return [];
      }

      const authenticators = [];

      if (await this.isPlatformAuthenticatorAvailable()) {
        authenticators.push({
          id: 'platform',
          type: 'platform',
          name: this.getPlatformAuthenticatorName()
        });
      }

      if (await this.isCrossPlatformAuthenticatorAvailable()) {
        authenticators.push({
          id: 'cross-platform',
          type: 'cross-platform',
          name: 'Security Key'
        });
      }

      return authenticators;
    } catch (error) {
      console.error('Failed to get available authenticators:', error);
      return [];
    }
  }

  private static async isPlatformAuthenticatorAvailable(): Promise<boolean> {
    try {
      return await PublicKeyCredential.isUserVerifyingPlatformAuthenticatorAvailable();
    } catch {
      return false;
    }
  }

  private static async isCrossPlatformAuthenticatorAvailable(): Promise<boolean> {
    return false;
  }

  private static getPlatformAuthenticatorName(): string {
    if (navigator.platform.includes('Mac')) {
      return 'Touch ID';
    } else if (navigator.platform.includes('Win')) {
      return 'Windows Hello';
    } else {
      return 'Platform Authenticator';
    }
  }
} 