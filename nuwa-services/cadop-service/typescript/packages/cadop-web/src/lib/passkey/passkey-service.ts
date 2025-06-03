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
  /**
   * Check if the browser supports WebAuthn/Passkey
   */
  public async isSupported(): Promise<boolean> {
    return window.PublicKeyCredential !== undefined &&
      await PublicKeyCredential.isUserVerifyingPlatformAuthenticatorAvailable();
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

      // 2. Create credentials
      const credential = await navigator.credentials.create({
        publicKey: this.preformatRegistrationOptions(data.options),
      }) as PublicKeyCredential;

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
      // 1. Get authentication options from server
      const { data, error } = await apiClient.getAuthenticationOptions(userIdentifier);
      
      if (error || !data?.options) {
        throw new Error(error?.message || 'Failed to get authentication options');
      }

      // 2. Get credentials
      const credential = await navigator.credentials.get({
        publicKey: this.preformatAuthenticationOptions(data.options),
      }) as PublicKeyCredential;

      // 3. Verify authentication with server
      const verificationResult = await apiClient.verifyAuthentication(
        this.formatAuthenticationResponse(credential)
      );

      if (verificationResult.error) {
        throw new Error(verificationResult.error.message);
      }

      return verificationResult.data || {
        success: false,
        error: 'No data returned from server'
      };
    } catch (error) {
      console.error('Passkey authentication failed:', error);
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
      authenticatorAttachment: (credential.authenticatorAttachment as AuthenticatorAttachment) || undefined,
    };
  }
} 