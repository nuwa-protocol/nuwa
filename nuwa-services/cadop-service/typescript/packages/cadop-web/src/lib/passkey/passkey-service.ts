import {
  AuthenticationOptions,
  AuthenticationResult,
  WebAuthnError,
  WebAuthnErrorCode,
  CredentialInfo,
  DIDKeyManager
} from '@cadop/shared';

import type {
  AuthenticatorTransportFuture,
  PublicKeyCredentialDescriptor,
  PublicKeyCredentialCreationOptionsJSON,
  PublicKeyCredentialRequestOptionsJSON,
  RegistrationResponseJSON,
  AuthenticationResponseJSON,
  AuthenticatorAttachment,
  UserVerificationRequirement,
  AuthenticatorSelectionCriteria,
  AttestationConveyancePreference,
  PublicKeyCredentialParameters
} from '@simplewebauthn/types';

import { apiClient } from '../api/client';
import { decode } from 'cbor2';

export class WebAuthnService {
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

      // 1. 获取认证选项
      console.log('📡 Requesting authentication options from server...');
      const { data, error } = await apiClient.post<AuthenticationOptions>('/api/webauthn/options', {
        user_did: userDid,
        name: options?.name,
        display_name: options?.displayName
      });

      if (error) {
        console.error('💥 Server error while getting options:', error);
        throw new WebAuthnError(
          error.message || 'Failed to get authentication options',
          WebAuthnErrorCode.INTERNAL_ERROR
        );
      }

      if (!data?.publicKey) {
        console.error('💥 No publicKey in server response:', data);
        throw new WebAuthnError(
          'No authentication options returned from server',
          WebAuthnErrorCode.INVALID_STATE
        );
      }

      console.log('📋 Received options from server', {
        isNewUser: data.isNewUser,
        publicKey: data.publicKey,
        rpId: ('rp' in data.publicKey ? data.publicKey.rp?.id : data.publicKey.rpId) || 'unknown',
        challenge: data.publicKey.challenge
      });

      // 2. 调用浏览器 API
      let credential: PublicKeyCredential;
      let response: RegistrationResponseJSON | AuthenticationResponseJSON;

      if (data.isNewUser) {
        // 注册流程
        console.log('🆕 Starting registration flow...');
        const createOptions = this.preformatCreateOptions(data.publicKey as PublicKeyCredentialCreationOptionsJSON);
        
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
              throw new WebAuthnError(
                'User denied the registration request or operation timed out',
                WebAuthnErrorCode.USER_CANCELLED
              );
            } else if (webauthnError.name === 'NotSupportedError') {
              throw new WebAuthnError(
                'WebAuthn is not supported on this device',
                WebAuthnErrorCode.NOT_SUPPORTED
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
        if (publicKey) {
          const publicKeyArray = new Uint8Array(publicKey);
          
          // 打印完整的公钥数据以进行调试
          console.log('🔑 Raw Public Key Data:', {
            hex: Array.from(publicKeyArray).map(b => b.toString(16).padStart(2, '0')).join(''),
            bytes: Array.from(publicKeyArray),
            length: publicKeyArray.length
          });
          
          // 解析 ASN.1 DER 编码的公钥
          try {
            // SPKI 格式中的 P-256 公钥：
            // 前缀: 3059301306072A8648CE3D020106082A8648CE3D030107034200
            // 0x04: 未压缩格式标记
            // [32 bytes]: x 坐标
            // [32 bytes]: y 坐标
            
            // 找到 0x04 标记（未压缩格式的 EC 公钥标记）
            let i = 0;
            while (i < publicKeyArray.length) {
              if (publicKeyArray[i] === 0x04) {
                break;
              }
              i++;
            }
            
            if (i >= publicKeyArray.length) {
              throw new Error('EC public key marker not found');
            }
            
            // 提取 x 坐标（32字节）
            const rawPublicKey = publicKeyArray.slice(i + 1, i + 33);
            const rawPublicKeyHex = Array.from(rawPublicKey)
              .map(b => b.toString(16).padStart(2, '0'))
              .join('');

            console.log('🔑 Extracted Public Key (x coordinate):', {
              hex: rawPublicKeyHex,
              length: rawPublicKey.length,
              expectedLength: 32,
              startIndex: i + 1
            });
            
            // 使用提取的公钥生成 DID
            const rawPublicKeyBuffer = rawPublicKey.buffer.slice(
              rawPublicKey.byteOffset,
              rawPublicKey.byteOffset + rawPublicKey.length
            );
            
            const did = await DIDKeyManager.generateDIDFromEd25519PublicKey(rawPublicKeyBuffer);
            this.saveDIDToStorage(did);
            console.log('🔑 Generated and saved DID:', { did });
          } catch (error) {
            console.error('Failed to process public key:', error);
            throw new WebAuthnError(
              'Failed to process public key',
              WebAuthnErrorCode.INTERNAL_ERROR,
              error
            );
          }
        }
      } else {
        // 登录流程
        console.log('🔐 Starting authentication flow...');
        const getOptions = this.preformatRequestOptions(data.publicKey as PublicKeyCredentialRequestOptionsJSON);
        
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
              throw new WebAuthnError(
                'User denied the authentication request or operation timed out',
                WebAuthnErrorCode.USER_CANCELLED
              );
            } else if (webauthnError.name === 'InvalidStateError') {
              throw new WebAuthnError(
                'No matching credentials found on this device',
                WebAuthnErrorCode.INVALID_CREDENTIAL
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
      const verificationResult = await apiClient.post<AuthenticationResult>('/api/webauthn/verify', {
        response
      });

      if (verificationResult.error) {
        console.error('💥 Server verification failed:', verificationResult.error);
        throw new WebAuthnError(
          verificationResult.error.message,
          WebAuthnErrorCode.AUTHENTICATION_FAILED
        );
      }

      const result = verificationResult.data || {
        success: false,
        error: new WebAuthnError(
          'No data returned from server',
          WebAuthnErrorCode.INTERNAL_ERROR
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
      throw error instanceof WebAuthnError ? error : new WebAuthnError(
        error instanceof Error ? error.message : 'Authentication failed',
        WebAuthnErrorCode.AUTHENTICATION_FAILED,
        error
      );
    }
  }

  /**
   * 获取用户的凭证列表
   */
  public async getCredentials(): Promise<CredentialInfo[]> {
    const { data, error } = await apiClient.get<{ credentials: CredentialInfo[] }>('/api/webauthn/credentials');
    if (error) {
      throw new WebAuthnError(
        error.message || 'Failed to get credentials',
        WebAuthnErrorCode.INTERNAL_ERROR
      );
    }
    return data?.credentials || [];
  }

  /**
   * 删除凭证
   */
  public async removeCredential(id: string): Promise<boolean> {
    const { data, error } = await apiClient.delete<{ success: boolean }>(`/webauthn/credentials/${id}`);
    if (error) {
      throw new WebAuthnError(
        error.message || 'Failed to remove credential',
        WebAuthnErrorCode.INTERNAL_ERROR
      );
    }
    return data?.success || false;
  }

  /**
   * 格式化注册选项
   */
  private preformatCreateOptions(
    options: PublicKeyCredentialCreationOptionsJSON
  ): PublicKeyCredentialCreationOptions {
    // 确保有 authenticatorSelection 配置
    const authenticatorSelection: AuthenticatorSelectionCriteria = {
      authenticatorAttachment: 'platform', // 强制使用平台认证器（Touch ID/Face ID）
      requireResidentKey: true,
      residentKey: 'required',
      userVerification: 'preferred'
    };

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
    const base64 = base64url.replace(/-/g, '+').replace(/_/g, '/').padEnd(base64url.length + ((4 - base64url.length % 4) % 4), '=');
    const binaryString = window.atob(base64);
    const bytes = new Uint8Array(binaryString.length);
    for (let i = 0; i < binaryString.length; i++) {
      bytes[i] = binaryString.charCodeAt(i);
    }
    return bytes.buffer;
  }

  private arrayBufferToBase64URL(buffer: ArrayBuffer): string {
    const binary = String.fromCharCode(...new Uint8Array(buffer));
    const base64 = window.btoa(binary);
    return base64.replace(/\+/g, '-').replace(/\//g, '_').replace(/=/g, '');
  }
} 