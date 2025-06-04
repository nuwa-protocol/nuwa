import type {
  PasskeyRegistrationOptions,
  PasskeyAuthenticationOptions,
  PasskeyRegistrationResponse,
  PasskeyAuthenticationResponse,
  PasskeyRegistrationResult,
  PasskeyAuthenticationResult,
} from './types';

import type {
  AuthenticatorTransport,
  PublicKeyCredentialDescriptor,
  AuthenticatorTransportFuture,
} from '@simplewebauthn/types';

import { apiClient } from '../api/client';

export class PasskeyService {
  private developmentMode = import.meta.env.DEV;

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
   * Register a new Passkey
   */
  public async register(
    email: string,
    displayName?: string,
    friendlyName?: string
  ): Promise<PasskeyRegistrationResult> {
    try {
      // 1. Get registration options from server
      const { data, error } = await apiClient.getRegistrationOptions(email, displayName, friendlyName);
      
      if (error || !data?.options) {
        throw new Error(error?.message || 'Failed to get registration options');
      }

      // 2. Create credentials with authenticator selection
      const credentialOptions = this.preformatRegistrationOptions(data.options);
      
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

      const credential = await navigator.credentials.create({
        publicKey: credentialOptions,
      }) as PublicKeyCredential;

      console.log('🆔 Authenticator used for registration:', {
        authenticatorAttachment: credential.authenticatorAttachment,
        id: credential.id
      });

      // 3. Verify registration with server
      const verificationResult = await apiClient.verifyRegistration(
        this.formatRegistrationResponse(credential),
        friendlyName
      );

      if (verificationResult.error) {
        throw new Error(verificationResult.error.message);
      }

      return {
        ...verificationResult.data!,
        user_id: data.user_id // Include the user_id from registration options
      };
    } catch (error) {
      console.error('Passkey registration failed:', error);
      return {
        success: false,
        error: error instanceof Error ? error.message : 'Registration failed',
      };
    }
  }

  /**
   * Authenticate with Passkey
   */
  public async authenticate(
    userIdentifier?: string
  ): Promise<PasskeyAuthenticationResult> {
    try {
      console.log('🚀 Starting Passkey authentication flow', { userIdentifier });

      // 1. Get authentication options from server
      const { data, error } = await apiClient.getAuthenticationOptions(userIdentifier);
      
      if (error || !data?.options) {
        throw new Error(error?.message || 'Failed to get authentication options');
      }

      console.log('📋 Received authentication options', { 
        challengeLength: data.options.challenge.length,
        allowCredentialsCount: data.options.allowCredentials?.length || 0
      });

      // 2. Prepare authentication options with authenticator selection
      const authOptions = this.preformatAuthenticationOptions(data.options);
      
      // 在开发环境中添加用户验证偏好，可能有助于绕过 1Password
      if (this.developmentMode) {
        authOptions.userVerification = 'preferred';
        
        console.log('🔧 Development mode: Setting user verification preference', {
          userVerification: authOptions.userVerification,
          allowCredentialsCount: authOptions.allowCredentials?.length || 0
        });
      }

      // 3. Get credentials
      const credential = await navigator.credentials.get({
        publicKey: authOptions,
      }) as PublicKeyCredential;

      if (!credential) {
        throw new Error('No credential returned from authenticator');
      }

      console.log('🔐 Credential obtained from authenticator', {
        credentialId: credential.id,
        type: credential.type,
        authenticatorAttachment: credential.authenticatorAttachment,
        possibleAuthenticator: this.identifyAuthenticator(credential)
      });

      // 分析当前的authenticatorData（第一次分析）
      const authDataAnalysis = this.analyzeAuthenticatorData(
        (credential.response as AuthenticatorAssertionResponse).authenticatorData
      );
      
      console.log('📊 Pre-verification AuthenticatorData analysis', {
        credentialId: credential.id,
        counterValue: authDataAnalysis.counter,
        flags: authDataAnalysis.flags,
        isValidLength: authDataAnalysis.isValidLength
      });

      // 3. Verify authentication with server
      console.log('🔍 Sending verification request to server...');
      const verificationResult = await apiClient.verifyAuthentication(
        this.formatAuthenticationResponse(credential)
      );

      console.log('📬 Received verification result from server', {
        success: !!verificationResult.data?.success,
        hasError: !!verificationResult.error,
        errorMessage: verificationResult.error?.message,
        resultData: verificationResult.data
      });

      if (verificationResult.error) {
        const errorMessage = verificationResult.error.message;
        
        console.error('❌ Server verification failed', {
          errorMessage,
          errorCode: verificationResult.error.code,
          errorDetails: verificationResult.error.details,
          credentialId: credential.id,
          counterValue: authDataAnalysis.counter
        });
        
        // 检查是否是counter错误（开发环境）
        if (import.meta.env.DEV && 
            errorMessage.includes('counter') && 
            errorMessage.includes('lower than expected')) {
          
          console.warn('🚨 Counter error detected, performing detailed analysis...');
          
          console.error('💥 Counter Error Diagnosis:', {
            credentialId: credential.id,
            errorMessage,
            authDataAnalysis,
            possibleCauses: [
              'Chrome DevTools virtual authenticator reset',
              'Browser storage cleared',
              'Authenticator device reset',
              'Database counter mismatch',
              'Previous authentication success but client-side error'
            ],
            recommendations: [
              'Delete and recreate virtual authenticator in DevTools',
              'Clear all credentials in WebAuthn panel',
              'Use real authenticator instead of virtual one',
              'Call reset counter API (development only)',
              'Check client-side error handling'
            ]
          });
          
          try {
            // 尝试重置counter并重新认证
            console.log('🔄 Attempting automatic counter reset...');
            const resetResult = await apiClient.resetAuthenticatorCounter(credential.id);
            
            if (resetResult.data?.success) {
              console.log('✅ Counter reset successful, retrying authentication...');
              
              // 重新获取认证选项
              const { data: retryData, error: retryError } = await apiClient.getAuthenticationOptions(userIdentifier);
              
              if (!retryError && retryData?.options) {
                // 重新进行认证
                const retryCredential = await navigator.credentials.get({
                  publicKey: this.preformatAuthenticationOptions(retryData.options),
                }) as PublicKeyCredential;
                
                // 分析重试的authenticatorData
                const retryAuthDataAnalysis = this.analyzeAuthenticatorData(
                  (retryCredential.response as AuthenticatorAssertionResponse).authenticatorData
                );
                
                console.log('🔄 Retry Authentication Analysis:', {
                  credentialId: retryCredential.id,
                  retryAuthDataAnalysis,
                  counterAfterReset: retryAuthDataAnalysis.counter
                });
                
                const retryVerificationResult = await apiClient.verifyAuthentication(
                  this.formatAuthenticationResponse(retryCredential)
                );
                
                if (!retryVerificationResult.error) {
                  console.log('🎉 Authentication successful after counter reset!');
                  return retryVerificationResult.data || {
                    success: false,
                    error: 'No data returned from server'
                  };
                } else {
                  console.error('❌ Authentication still failed after counter reset:', {
                    retryError: retryVerificationResult.error,
                    counterValue: retryAuthDataAnalysis.counter
                  });
                }
              }
            } else {
              console.error('❌ Counter reset failed:', resetResult.error);
            }
          } catch (resetError) {
            console.error('💥 Exception during counter reset:', resetError);
          }
        }
        
        throw new Error(errorMessage);
      }

      // 认证成功后的详细状态检查
      const result = verificationResult.data || {
        success: false,
        error: 'No data returned from server'
      };

      if (result.success) {
        console.log('🎉 Authentication completed successfully!', {
          credentialId: credential.id,
          userId: result.session?.user?.id,
          sessionInfo: result.session ? 'Session created' : 'No session info',
          counterUsedInAuth: authDataAnalysis.counter
        });

        // 检查认证成功后的状态是否一致
        try {
          // 尝试再次分析当前认证器状态（如果可能的话）
          console.log('🔍 Post-authentication state check', {
            clientSideCounter: authDataAnalysis.counter,
            authenticationSuccessful: true,
            serverResponse: {
              hasSession: !!result.session,
              hasUserId: !!result.session?.user?.id,
              sessionToken: result.session?.session_token ? 'Present' : 'Missing'
            }
          });
        } catch (stateCheckError) {
          console.warn('⚠️ Failed to perform post-authentication state check', {
            error: stateCheckError instanceof Error ? stateCheckError.message : stateCheckError,
            credentialId: credential.id
          });
        }
      } else {
        console.error('❌ Server indicated authentication failure despite no error', {
          result,
          credentialId: credential.id
        });
      }

      return result;
    } catch (error) {
      console.error('💥 Passkey authentication failed with exception', {
        error: error instanceof Error ? error.message : error,
        stack: error instanceof Error ? error.stack : undefined,
        userIdentifier
      });
      
      return {
        success: false,
        error: error instanceof Error ? error.message : 'Authentication failed',
      };
    }
  }

  /**
   * Helper: Convert base64url string to ArrayBuffer
   */
  private base64urlToArrayBuffer(base64url: string): ArrayBuffer {
    // Convert base64url to base64
    const base64 = base64url.replace(/-/g, '+').replace(/_/g, '/');
    // Add padding if needed
    const padded = base64.padEnd(base64.length + (4 - (base64.length % 4)) % 4, '=');
    
    const binaryString = window.atob(padded);
    const bytes = new Uint8Array(binaryString.length);
    for (let i = 0; i < binaryString.length; i++) {
      bytes[i] = binaryString.charCodeAt(i);
    }
    return bytes.buffer;
  }

  /**
   * Helper: Convert ArrayBuffer to base64url string
   */
  private arrayBufferToBase64url(buffer: ArrayBuffer): string {
    const binary = String.fromCharCode(...new Uint8Array(buffer));
    const base64 = window.btoa(binary);
    // Convert base64 to base64url
    return base64.replace(/\+/g, '-').replace(/\//g, '_').replace(/=/g, '');
  }

  /**
   * Helper: Format registration options for the browser
   */
  private preformatRegistrationOptions(
    options: PasskeyRegistrationOptions
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
    };
  }

  /**
   * Helper: Format authentication options for the browser
   */
  private preformatAuthenticationOptions(
    options: PasskeyAuthenticationOptions
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
   * Helper: Format registration response for the server
   */
  private formatRegistrationResponse(credential: PublicKeyCredential): PasskeyRegistrationResponse {
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
      authenticatorAttachment: (credential.authenticatorAttachment as AuthenticatorAttachment) || undefined,
    };
  }

  /**
   * Helper: Format authentication response for the server
   */
  private formatAuthenticationResponse(credential: PublicKeyCredential): PasskeyAuthenticationResponse {
    const response = credential.response as AuthenticatorAssertionResponse;
    
    // 使用新的分析函数
    const authDataAnalysis = this.analyzeAuthenticatorData(response.authenticatorData);
    const authenticatorDataBase64 = this.arrayBufferToBase64url(response.authenticatorData);
    
    // 检测是否是虚拟认证器（仅开发环境）
    const isVirtualAuthenticator = this.developmentMode && 
      typeof (window as any).__WEBAUTHN_VIRTUAL_AUTHENTICATOR__ !== 'undefined';
    
    console.debug('🔍 Detailed AuthenticatorData Analysis:', {
      credentialId: credential.id,
      analysis: authDataAnalysis,
      rawData: {
        authenticatorDataBase64,
        authenticatorDataLength: response.authenticatorData.byteLength,
        authenticatorDataHex: Array.from(new Uint8Array(response.authenticatorData))
          .map(b => b.toString(16).padStart(2, '0')).join(''),
      }
    });

    // 如果分析发现异常，记录警告
    if (!authDataAnalysis.isValidLength) {
      console.warn('⚠️ AuthenticatorData length is insufficient for counter extraction:', {
        credentialId: credential.id,
        actualLength: authDataAnalysis.totalLength,
        minimumRequired: 37
      });
    }

    if (authDataAnalysis.counter === 0) {
      console.warn('ℹ️ Counter value is 0 - this is normal for macOS platform authenticator:', {
        credentialId: credential.id,
        counterValue: authDataAnalysis.counter,
        flags: authDataAnalysis.flags,
        authenticatorAttachment: credential.authenticatorAttachment,
        platform: navigator.platform,
        userAgent: navigator.userAgent
      });
    }
    
    return {
      id: credential.id,
      rawId: this.arrayBufferToBase64url(credential.rawId),
      response: {
        authenticatorData: authenticatorDataBase64,
        clientDataJSON: this.arrayBufferToBase64url(response.clientDataJSON),
        signature: this.arrayBufferToBase64url(response.signature),
        userHandle: response.userHandle ? this.arrayBufferToBase64url(response.userHandle) : undefined,
      },
      type: 'public-key',
      clientExtensionResults: credential.getClientExtensionResults(),
      authenticatorAttachment: (credential.authenticatorAttachment as AuthenticatorAttachment) || undefined,
      authenticatorInfo: {
        userAgent: navigator.userAgent,
        platform: navigator.platform,
        isVirtualAuthenticator
      }
    };
  }

  /**
   * Helper: Analyze authenticatorData structure for debugging
   */
  private analyzeAuthenticatorData(authenticatorData: ArrayBuffer): {
    rpIdHash: string;
    flags: {
      userPresent: boolean;
      userVerified: boolean;
      attestedCredentialData: boolean;
      extensionData: boolean;
      backupEligible: boolean;
      backupState: boolean;
      flagsByte: number;
      flagsBinary: string;
    };
    counter: number;
    totalLength: number;
    isValidLength: boolean;
  } {
    const buffer = new Uint8Array(authenticatorData);
    
    if (buffer.length < 37) {
      return {
        rpIdHash: 'INVALID',
        flags: {
          userPresent: false,
          userVerified: false,
          attestedCredentialData: false,
          extensionData: false,
          backupEligible: false,
          backupState: false,
          flagsByte: 0,
          flagsBinary: '00000000'
        },
        counter: 0,
        totalLength: buffer.length,
        isValidLength: false
      };
    }

    const rpIdHash = Array.from(buffer.slice(0, 32))
      .map(b => b.toString(16).padStart(2, '0'))
      .join('');
    
    const flagsByte = buffer[32];
    const flagsBinary = flagsByte.toString(2).padStart(8, '0');
    
    // 解析flags (根据WebAuthn规范)
    const flags = {
      userPresent: (flagsByte & 0x01) !== 0,        // bit 0
      userVerified: (flagsByte & 0x04) !== 0,       // bit 2
      attestedCredentialData: (flagsByte & 0x40) !== 0, // bit 6
      extensionData: (flagsByte & 0x80) !== 0,      // bit 7
      backupEligible: (flagsByte & 0x08) !== 0,     // bit 3
      backupState: (flagsByte & 0x10) !== 0,        // bit 4
      flagsByte,
      flagsBinary
    };

    // 读取counter (big-endian, 4 bytes)
    const counter = new DataView(authenticatorData, 33, 4).getUint32(0, false);

    return {
      rpIdHash,
      flags,
      counter,
      totalLength: buffer.length,
      isValidLength: buffer.length >= 37
    };
  }

  /**
   * Helper: Identify the authenticator type for debugging
   */
  private identifyAuthenticator(credential: PublicKeyCredential): string {
    const attachment = credential.authenticatorAttachment;
    const id = credential.id;
    
    // 简单的启发式识别
    if (attachment === 'platform') {
      return 'Platform Authenticator (TouchID/FaceID/Windows Hello)';
    } else if (attachment === 'cross-platform') {
      if (id.includes('1password') || id.includes('1pwd')) {
        return '1Password (cross-platform)';
      }
      return 'Cross-platform Authenticator (Hardware Key/1Password/etc)';
    } else {
      // 没有明确的 attachment，尝试其他方式识别
      if (id.includes('1password') || id.includes('1pwd')) {
        return '1Password (unknown attachment)';
      }
      return 'Unknown Authenticator';
    }
  }
} 