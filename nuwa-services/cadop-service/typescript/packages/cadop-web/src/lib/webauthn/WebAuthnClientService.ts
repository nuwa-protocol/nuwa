import {
  AuthenticationResult,
  CadopError,
  CadopErrorCode,
  DIDKeyManager,
  CredentialInfo,
} from '@cadop/shared';

import type {
  AuthenticatorTransportFuture,
  PublicKeyCredentialCreationOptionsJSON,
  PublicKeyCredentialRequestOptionsJSON,
  RegistrationResponseJSON,
  AuthenticationResponseJSON,
  AuthenticatorAttachment,
} from '@simplewebauthn/types';

import { webAuthnClient } from '../api/client';
import { Base64 } from 'js-base64';

import { DidKeyCodec, KEY_TYPE, KeyType } from 'nuwa-identity-kit';

// 部分环境下 nuwa-identity-kit 版本尚未导出 algorithmToKeyType，这里做本地回退
const algorithmToKeyType = (alg: number): KeyType | undefined => {
  switch (alg) {
    case -8:
      return KEY_TYPE.ED25519;
    case -7:
      return KEY_TYPE.ECDSAR1;
    default:
      return undefined;
  }
};

// 根据算法从 SPKI(SubjectPublicKeyInfo) 中提取原始公钥 (compressed for P-256, raw for Ed25519)
function extractRawPublicKey(spkiInput: ArrayBuffer | Uint8Array, alg: number): Uint8Array {
  const spki = spkiInput instanceof Uint8Array ? spkiInput : new Uint8Array(spkiInput);

  if (alg === -8) {
    // Ed25519: SPKI 末尾 32 字节即为公钥
    return spki.slice(spki.length - 32);
  }

  if (alg === -7) {
    // P-256: 查找 0x04 (uncompressed marker)，后跟 64B (X||Y)
    const idx = spki.indexOf(0x04);
    if (idx === -1 || idx + 65 > spki.length) {
      throw new Error('Invalid P-256 SPKI format');
    }
    const x = spki.slice(idx + 1, idx + 33);
    const y = spki.slice(idx + 33, idx + 65);
    // 压缩格式：0x02 / 0x03 + X
    const prefix = (y[y.length - 1] & 1) === 0 ? 0x02 : 0x03;
    const compressed = new Uint8Array(33);
    compressed[0] = prefix;
    compressed.set(x, 1);
    return compressed;
  }

  throw new Error(`Unsupported algorithm ${alg}`);
}

export class WebAuthnClientService {
  private developmentMode = import.meta.env.DEV;
  private localStorageKey = 'passkey_did';

  /**
   * 从本地存储获取 DID
   */
  private getDIDFromStorage(): string | null {
    return localStorage.getItem(this.localStorageKey);
  }

  /**
   * 保存 DID 到本地存储
   */
  private saveDIDToStorage(did: string): void {
    localStorage.setItem(this.localStorageKey, did);
  }

  /**
   * 检查浏览器是否支持 WebAuthn
   */
  public async isSupported(): Promise<boolean> {
    return window.PublicKeyCredential !== undefined &&
      await PublicKeyCredential.isUserVerifyingPlatformAuthenticatorAvailable();
  }

  /**
   * 统一的认证方法（包含注册和登录）
   */
  public async authenticate(options?: {
    name?: string;
    displayName?: string;
  }): Promise<AuthenticationResult> {
    try {
      // 尝试从本地存储获取 DID
      const userDid = this.getDIDFromStorage();
      console.log('🔑 Retrieved DID from storage:', { userDid });

      // 检查当前网站下是否存在 credential
      const existingCredential = await this.checkExistingCredentials();
      console.log('🔍 Checked for existing credentials:', { 
        hasCredential: !!existingCredential,
        credentialId: existingCredential?.id
      });

      // 1. 获取认证选项
      console.log('📡 Requesting authentication options from server...');
      let optionsResponse = await webAuthnClient.getAuthenticationOptions({
        user_did: userDid || undefined,
        name: options?.name,
        display_name: options?.displayName,
        existing_credential: existingCredential ? {
          id: existingCredential.id,
          type: existingCredential.type,
          transports: existingCredential.transports
        } : undefined
      });

      console.log('🔍 Received options from server:', optionsResponse);

      if (optionsResponse.error) {
        console.error('💥 Server error while getting options:', optionsResponse.error);
        throw new CadopError(
          optionsResponse.error.message || 'Failed to get authentication options',
          CadopErrorCode.INTERNAL_ERROR
        );
      }

      const authOptions = optionsResponse.data;

      if (!authOptions?.publicKey) {
        console.error('💥 No publicKey in server response:', authOptions);
        throw new CadopError(
          'No authentication options returned from server',
          CadopErrorCode.INVALID_STATE
        );
      }

      console.log('📋 Received options from server', {
        isNewUser: authOptions.isNewUser,
        publicKey: authOptions.publicKey,
        rpId: ('rp' in authOptions.publicKey ? authOptions.publicKey.rp?.id : authOptions.publicKey.rpId) || 'unknown',
        challenge: authOptions.publicKey.challenge
      });

      // 2. 调用浏览器 API
      let credential: PublicKeyCredential;
      let response: RegistrationResponseJSON | AuthenticationResponseJSON;

      if (authOptions.isNewUser) {
        // 注册流程
        console.log('🆕 Starting registration flow...');
        const createOptions = this.preformatCreateOptions(authOptions.publicKey as PublicKeyCredentialCreationOptionsJSON);
        
        console.log('🔧 Calling navigator.credentials.create()...');
        try {
          credential = await navigator.credentials.create({
            publicKey: createOptions
          }) as PublicKeyCredential;
        } catch (webauthnError) {
          console.error('💥 WebAuthn registration failed:', webauthnError);
          
          // 检查常见错误
          if (webauthnError instanceof Error) {
            if (webauthnError.name === 'NotAllowedError') {
              throw new CadopError(
                'User denied the registration request or operation timed out',
                CadopErrorCode.USER_CANCELLED
              );
            } else if (webauthnError.name === 'NotSupportedError') {
              throw new CadopError(
                'WebAuthn is not supported on this device',
                CadopErrorCode.NOT_SUPPORTED
              );
            }
          }
          throw webauthnError;
        }

        console.log('🆔 Created new credential:', {
          id: credential.id,
          type: credential.type,
          authenticatorAttachment: credential.authenticatorAttachment
        });

        response = this.formatRegistrationResponse(credential);

        // 生成 DID
        const attestationResponse = credential.response as AuthenticatorAttestationResponse;
        
        const publicKey = attestationResponse.getPublicKey();
        const publicKeyAlgorithm = attestationResponse.getPublicKeyAlgorithm();
        console.log('🔑 Public Key Algorithm:', publicKeyAlgorithm);
        if (publicKey) {
          const rawPublicKey = extractRawPublicKey(publicKey, publicKeyAlgorithm);
          
          // 打印完整的公钥数据以进行调试
          console.log('🔑 Raw Public Key Data:', {
            hex: Array.from(rawPublicKey).map(b => b.toString(16).padStart(2, '0')).join(''),
            bytes: Array.from(rawPublicKey),
            length: rawPublicKey.length
          });
          
          // 使用提取的公钥生成 DID
          const keyType = algorithmToKeyType(publicKeyAlgorithm);
          if (!keyType) {
            throw new Error('Unsupported algorithm');
          }
          const did = DidKeyCodec.generateDidKey(rawPublicKey, keyType);
          this.saveDIDToStorage(did);
          console.log('🔑 Generated and saved DID:', { did });
        }
      } else {
        // 登录流程
        console.log('🔐 Starting authentication flow...');
        const getOptions = this.preformatRequestOptions(authOptions.publicKey as PublicKeyCredentialRequestOptionsJSON);
        
        console.log('🔧 Calling navigator.credentials.get()...');
        try {
          credential = await navigator.credentials.get({
            publicKey: getOptions
          }) as PublicKeyCredential;
        } catch (webauthnError) {
          console.error('💥 WebAuthn authentication failed:', webauthnError);
          
          // 检查常见错误
          if (webauthnError instanceof Error) {
            if (webauthnError.name === 'NotAllowedError') {
              throw new CadopError(
                'User denied the authentication request or operation timed out',
                CadopErrorCode.USER_CANCELLED
              );
            } else if (webauthnError.name === 'InvalidStateError') {
              throw new CadopError(
                'No matching credentials found on this device',
                CadopErrorCode.INVALID_CREDENTIAL
              );
            }
          }
          throw webauthnError;
        }

        console.log('🔐 Retrieved credential:', {
          id: credential.id,
          type: credential.type,
          authenticatorAttachment: credential.authenticatorAttachment
        });

        response = this.formatAuthenticationResponse(credential);
      }

      // 3. 验证响应
      console.log('📤 Sending verification request to server...');
      const verificationResult = await webAuthnClient.verifyAuthenticationResponse(response);

      if (verificationResult.error) {
        console.error('💥 Server verification failed:', verificationResult.error);
        throw new CadopError(
          verificationResult.error.message,
          CadopErrorCode.AUTHENTICATION_FAILED
        );
      }

      const result = verificationResult.data || {
        success: false,
        error: new CadopError(
          'No data returned from server',
          CadopErrorCode.INTERNAL_ERROR
        )
      };

      console.log('✅ Authentication completed successfully:', {
        success: result.success,
        isNewUser: result.isNewUser,
        hasSession: !!result.session
      });

      return result;
    } catch (error) {
      console.error('💥 Authentication failed:', error);
      throw error instanceof CadopError ? error : new CadopError(
        error instanceof Error ? error.message : 'Authentication failed',
        CadopErrorCode.AUTHENTICATION_FAILED,
        error
      );
    }
  }

  /**
   * 格式化注册选项
   */
  private preformatCreateOptions(
    options: PublicKeyCredentialCreationOptionsJSON
  ): PublicKeyCredentialCreationOptions {
    // 确保有 authenticatorSelection 配置
    // const authenticatorSelection: AuthenticatorSelectionCriteria = {
    //   authenticatorAttachment: 'platform', // 强制使用平台认证器（Touch ID/Face ID）
    //   requireResidentKey: true,
    //   residentKey: 'required',
    //   userVerification: 'preferred'
    // };

    // 在开发环境中添加额外的日志
    if (this.developmentMode) {
      console.log('🔧 preformatCreateOptions:', {
        options,
        origin: window.location.origin,
        userAgent: navigator.userAgent
      });
    }

    // const pubKeyCredParams: PublicKeyCredentialParameters[] = [
    //   {
    //     alg: -8, // EdDSA (Ed25519)
    //     type: 'public-key'
    //   }
    // ];

    const createOptions = {
      ...options,
      challenge: this.base64URLToBuffer(options.challenge),
      user: {
        ...options.user,
        id: this.base64URLToBuffer(options.user.id),
      },
      excludeCredentials: options.excludeCredentials?.map(credential => ({
        ...credential,
        id: this.base64URLToBuffer(credential.id),
        transports: credential.transports as AuthenticatorTransport[],
      })),
      rp: options.rp,
      timeout: 60000, // 设置足够长的超时时间
      // attestation: options.attestation,
      // authenticatorSelection: options.authenticatorSelection,
    };

    if (this.developmentMode) {
      console.log('📋 Create options:', createOptions);
      console.log('🔍 Expected behavior: Should show Touch ID/Face ID prompt, NOT QR code');
    }

    return createOptions;
  }

  /**
   * 格式化认证选项
   */
  private preformatRequestOptions(
    options: PublicKeyCredentialRequestOptionsJSON
  ): PublicKeyCredentialRequestOptions {
    return {
      ...options,
      challenge: this.base64URLToBuffer(options.challenge),
      allowCredentials: options.allowCredentials?.map(credential => ({
        ...credential,
        id: this.base64URLToBuffer(credential.id),
        transports: credential.transports as AuthenticatorTransport[],
      })),
      rpId: options.rpId,
      timeout: options.timeout,
      userVerification: options.userVerification,
    };
  }

  /**
   * 格式化注册响应
   */
  private formatRegistrationResponse(credential: PublicKeyCredential): RegistrationResponseJSON {
    const response = credential.response as AuthenticatorAttestationResponse;
    return {
      id: credential.id,
      rawId: this.arrayBufferToBase64URL(credential.rawId),
      type: 'public-key',
      response: {
        attestationObject: this.arrayBufferToBase64URL(response.attestationObject),
        clientDataJSON: this.arrayBufferToBase64URL(response.clientDataJSON),
        transports: (response.getTransports?.() || []) as AuthenticatorTransportFuture[],
      },
      clientExtensionResults: credential.getClientExtensionResults(),
      authenticatorAttachment: credential.authenticatorAttachment as AuthenticatorAttachment | undefined,
    };
  }

  /**
   * 格式化认证响应
   */
  private formatAuthenticationResponse(credential: PublicKeyCredential): AuthenticationResponseJSON {
    const response = credential.response as AuthenticatorAssertionResponse;
    return {
      id: credential.id,
      rawId: this.arrayBufferToBase64URL(credential.rawId),
      type: 'public-key',
      response: {
        authenticatorData: this.arrayBufferToBase64URL(response.authenticatorData),
        clientDataJSON: this.arrayBufferToBase64URL(response.clientDataJSON),
        signature: this.arrayBufferToBase64URL(response.signature),
        userHandle: response.userHandle ? this.arrayBufferToBase64URL(response.userHandle) : undefined,
      },
      clientExtensionResults: credential.getClientExtensionResults(),
      authenticatorAttachment: credential.authenticatorAttachment as AuthenticatorAttachment | undefined,
    };
  }

  private base64URLToBuffer(base64url: string): ArrayBuffer {
    const bytes = Base64.toUint8Array(base64url);
    return bytes.buffer;
  }

  private arrayBufferToBase64URL(buffer: ArrayBuffer): string {
    const bytes = new Uint8Array(buffer);
    return Base64.fromUint8Array(bytes, true);
  }

  /**
   * 检查当前网站下是否存在 credential
   * @returns 如果存在 credential，返回 credential 信息，否则返回 null
   */
  private async checkExistingCredentials(): Promise<CredentialInfo | null> {
    try {
      // Create an empty authentication options object
      const options: PublicKeyCredentialRequestOptions = {
        challenge: new Uint8Array(32),
        rpId: window.location.hostname,
        allowCredentials: [],
        userVerification: 'preferred',
      };

      // Try to get credentials
      const credential = await navigator.credentials.get({
        publicKey: options,
        mediation: 'silent'
      }) as PublicKeyCredential | null;

      if (credential) {
        return {
          id: credential.id,
          type: credential.type,
          transports: (credential as any).transports
        };
      }
      return null;
    } catch (error) {
      console.error('Error checking existing credentials:', error);
      return null;
    }
  }
} 