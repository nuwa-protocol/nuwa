import type {
  WebAuthnOptionsResponse,
  WebAuthnAuthenticationResponse,
  WebAuthnAuthenticationResult,
  WebAuthnRegistrationResponse,
} from '@cadop/shared';

import type {
  AuthenticatorTransport,
  PublicKeyCredentialDescriptor,
  AuthenticatorTransportFuture,
  PublicKeyCredentialCreationOptionsJSON,
  PublicKeyCredentialRequestOptionsJSON,
  AttestationConveyancePreference,
} from '@simplewebauthn/types';

import { apiClient } from '../api/client';
import { DIDKeyManager } from './did-key';

export class PasskeyService {
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
   * Check if the browser supports WebAuthn/Passkey
   */
  public async isSupported(): Promise<boolean> {
    return window.PublicKeyCredential !== undefined &&
      await PublicKeyCredential.isUserVerifyingPlatformAuthenticatorAvailable();
  }

  /**
   * Check if 1Password might be interfering with WebAuthn
   */
  public async check1PasswordInterference(): Promise<{
    detected: boolean;
    message?: string;
    recommendation?: string;
  }> {
    try {
      // 检查是否有 1Password 扩展
      const has1PasswordExtension = !!(window as any).OnePasswordExtension || 
                                   document.querySelector('[data-1p-ignore]') ||
                                   document.querySelector('.onepassword-extension-element');

      if (has1PasswordExtension) {
        return {
          detected: true,
          message: '检测到 1Password 扩展可能会拦截 WebAuthn 请求',
          recommendation: '建议在开发时暂时禁用 1Password 扩展或使用 Chrome DevTools 虚拟认证器'
        };
      }

      return { detected: false };
    } catch (error) {
      return { detected: false };
    }
  }

  /**
   * Authenticate with Passkey
   * If user doesn't exist, server will handle registration automatically
   */
  public async authenticate(): Promise<WebAuthnAuthenticationResult> {
    try {
      // 尝试从本地存储获取 DID
      let userDid = this.getDIDFromStorage() || undefined;
      console.log('🔑 Retrieved DID from storage:', { userDid });

      // 1. Get authentication options from server
      const { data, error } = await apiClient.getAuthenticationOptions(userDid);
      
      if (error) {
        throw new Error(error.message || 'Failed to get authentication options');
      }

      if (!data?.options) {
        throw new Error('No authentication options returned from server');
      }

      const optionsResponse = data as WebAuthnOptionsResponse;

      console.log('📋 Received options from server', { 
        isRegistration: optionsResponse.isRegistration,
        challengeLength: optionsResponse.options.challenge.length,
        allowCredentialsCount: 'allowCredentials' in optionsResponse.options ? optionsResponse.options.allowCredentials?.length || 0 : 'N/A'
      });

      let credential: PublicKeyCredential;
      
      // 2. 根据返回的选项类型调用不同的浏览器 API
      if (optionsResponse.isRegistration) {
        // 处理注册流程
        const registrationOptions = optionsResponse.options as PublicKeyCredentialCreationOptionsJSON;
        const credentialOptions = this.preformatRegistrationOptions(registrationOptions);
        
        // 在开发环境中强制使用平台认证器，避免 1Password 拦截
        if (this.developmentMode) {
          credentialOptions.authenticatorSelection = {
            authenticatorAttachment: 'platform', // 强制使用平台认证器 
            requireResidentKey: false,
            residentKey: 'discouraged',
            userVerification: 'preferred'
          };
          
          console.log('🔧 Development mode: Forcing platform authenticator to avoid 1Password', {
            authenticatorSelection: credentialOptions.authenticatorSelection
          });
        }

        credential = await navigator.credentials.create({
          publicKey: credentialOptions,
        }) as PublicKeyCredential;

        console.log('🆔 Authenticator used for registration:', {
          authenticatorAttachment: credential.authenticatorAttachment,
          id: credential.id
        });

        // 从认证器响应中获取公钥并生成 DID
        const response = credential.response as AuthenticatorAttestationResponse;
        const publicKey = response.getPublicKey();
        if (publicKey) {
          userDid = await DIDKeyManager.generateDIDFromPublicKey(publicKey);
          this.saveDIDToStorage(userDid);
          console.log('🔑 Generated and saved DID:', { userDid });
        }

        // 调用统一的验证接口
        const verificationResult = await apiClient.verify(
          this.formatRegistrationResponse(credential),
          'Default Device',
          userDid // 传递生成的 did:key
        );

        if (verificationResult.error) {
          throw new Error(verificationResult.error.message);
        }

        return verificationResult.data || {
          success: false,
          error: 'No data returned from server'
        };

      } else {
        // 处理认证流程
        const authenticationOptions = optionsResponse.options as PublicKeyCredentialRequestOptionsJSON;
        const authOptions = this.preformatAuthenticationOptions(authenticationOptions);
        
        // 在开发环境中添加用户验证偏好，可能有助于绕过 1Password
        if (this.developmentMode) {
          authOptions.userVerification = 'preferred';
          
          console.log('🔧 Development mode: Setting user verification preference', {
            userVerification: authOptions.userVerification,
            allowCredentialsCount: authOptions.allowCredentials?.length || 0
          });
        }

        credential = await navigator.credentials.get({
          publicKey: authOptions,
        }) as PublicKeyCredential;

        console.log('🔐 Credential obtained from authenticator', {
          credentialId: credential.id,
          type: credential.type,
          authenticatorAttachment: credential.authenticatorAttachment,
          possibleAuthenticator: this.identifyAuthenticator(credential)
        });
      }

      // 3. 验证响应
      console.log('🔍 Sending verification request to server...');
      const verificationResult = await apiClient.verify(
        this.formatAuthenticationResponse(credential)
      );

      console.log('📬 Received verification result from server', {
        success: !!verificationResult.data?.success,
        hasError: !!verificationResult.error,
        errorMessage: verificationResult.error?.message,
        resultData: verificationResult.data
      });

      if (verificationResult.error) {
        throw new Error(verificationResult.error.message);
      }

      return verificationResult.data || {
        success: false,
        error: 'No data returned from server'
      };
    } catch (error) {
      console.error('💥 Passkey authentication failed with exception', {
        error: error instanceof Error ? error.message : error,
        userDid: this.getDIDFromStorage()
      });
      
      return {
        success: false,
        error: error instanceof Error ? error.message : 'Authentication failed',
      };
    }
  }

  /**
   * Helper: Format registration options for the browser
   */
  private preformatRegistrationOptions(
    options: PublicKeyCredentialCreationOptionsJSON
  ): PublicKeyCredentialCreationOptions {
    return {
      ...options,
      challenge: this.base64urlToArrayBuffer(options.challenge),
      user: {
        ...options.user,
        id: this.base64urlToArrayBuffer(options.user.id),
      },
      excludeCredentials: options.excludeCredentials?.map(credential => ({
        ...credential,
        id: this.base64urlToArrayBuffer(credential.id),
        transports: credential.transports as AuthenticatorTransport[],
      })) as PublicKeyCredentialDescriptor[],
      attestation: options.attestation as AttestationConveyancePreference,
    };
  }

  /**
   * Helper: Format authentication options for the browser
   */
  private preformatAuthenticationOptions(
    options: PublicKeyCredentialRequestOptionsJSON
  ): PublicKeyCredentialRequestOptions {
    return {
      ...options,
      challenge: this.base64urlToArrayBuffer(options.challenge),
      allowCredentials: options.allowCredentials?.map(credential => ({
        ...credential,
        id: this.base64urlToArrayBuffer(credential.id),
        transports: credential.transports as AuthenticatorTransport[],
      })) as PublicKeyCredentialDescriptor[],
    };
  }

  /**
   * Helper: Format authentication response for the server
   */
  private formatAuthenticationResponse(credential: PublicKeyCredential): WebAuthnAuthenticationResponse {
    const response = credential.response as AuthenticatorAssertionResponse;
    
    return {
      id: credential.id,
      rawId: this.arrayBufferToBase64url(credential.rawId),
      response: {
        authenticatorData: this.arrayBufferToBase64url(response.authenticatorData),
        clientDataJSON: this.arrayBufferToBase64url(response.clientDataJSON),
        signature: this.arrayBufferToBase64url(response.signature),
        userHandle: response.userHandle ? this.arrayBufferToBase64url(response.userHandle) : undefined,
      },
      type: 'public-key',
      clientExtensionResults: credential.getClientExtensionResults(),
      authenticatorAttachment: credential.authenticatorAttachment as AuthenticatorAttachment,
      authenticatorInfo: {
        userAgent: navigator.userAgent,
        platform: navigator.platform,
        isVirtualAuthenticator: this.developmentMode && 
          typeof (window as any).__WEBAUTHN_VIRTUAL_AUTHENTICATOR__ !== 'undefined'
      }
    };
  }

  /**
   * Helper: Format registration response for the server
   */
  private formatRegistrationResponse(credential: PublicKeyCredential): WebAuthnRegistrationResponse {
    const response = credential.response as AuthenticatorAttestationResponse;
    
    return {
      id: credential.id,
      rawId: this.arrayBufferToBase64url(credential.rawId),
      response: {
        attestationObject: this.arrayBufferToBase64url(response.attestationObject),
        clientDataJSON: this.arrayBufferToBase64url(response.clientDataJSON),
        transports: response.getTransports?.() as AuthenticatorTransportFuture[] | undefined,
      },
      type: 'public-key',
      clientExtensionResults: credential.getClientExtensionResults(),
      authenticatorAttachment: credential.authenticatorAttachment as AuthenticatorAttachment,
    };
  }

  private base64urlToArrayBuffer(base64url: string): ArrayBuffer {
    const base64 = base64url.replace(/-/g, '+').replace(/_/g, '/');
    const padded = base64.padEnd(base64.length + (4 - (base64.length % 4)) % 4, '=');
    const binaryString = window.atob(padded);
    const bytes = new Uint8Array(binaryString.length);
    for (let i = 0; i < binaryString.length; i++) {
      bytes[i] = binaryString.charCodeAt(i);
    }
    return bytes.buffer;
  }

  private arrayBufferToBase64url(buffer: ArrayBuffer): string {
    const binary = String.fromCharCode(...new Uint8Array(buffer));
    const base64 = window.btoa(binary);
    return base64.replace(/\+/g, '-').replace(/\//g, '_').replace(/=/g, '');
  }

  private identifyAuthenticator(credential: PublicKeyCredential): string {
    const attachment = credential.authenticatorAttachment;
    const id = credential.id;
    
    if (attachment === 'platform') {
      return 'Platform Authenticator (TouchID/FaceID/Windows Hello)';
    } else if (attachment === 'cross-platform') {
      if (id.includes('1password') || id.includes('1pwd')) {
        return '1Password (cross-platform)';
      }
      return 'Cross-platform Authenticator (Hardware Key/1Password/etc)';
    } else {
      if (id.includes('1password') || id.includes('1pwd')) {
        return '1Password (unknown attachment)';
      }
      return 'Unknown Authenticator';
    }
  }
} 