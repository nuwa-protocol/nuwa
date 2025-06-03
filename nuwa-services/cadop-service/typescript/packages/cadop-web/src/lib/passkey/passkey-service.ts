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

export class PasskeyService {
  private apiBaseUrl: string;

  constructor() {
    this.apiBaseUrl = import.meta.env.VITE_API_URL || 'http://localhost:8080/api';
  }

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
      const optionsResponse = await fetch(`${this.apiBaseUrl}/webauthn/registration/options`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          email,
          display_name: displayName,
          friendly_name: friendlyName,
        }),
        credentials: 'include',
      });

      if (!optionsResponse.ok) {
        throw new Error('Failed to get registration options');
      }

      const { options } = await optionsResponse.json();

      // 2. Create credentials
      const credential = await navigator.credentials.create({
        publicKey: this.preformatRegistrationOptions(options),
      }) as PublicKeyCredential;

      // 3. Verify registration with server
      const verificationResponse = await fetch(`${this.apiBaseUrl}/webauthn/registration/verify`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          response: this.formatRegistrationResponse(credential),
          friendly_name: friendlyName,
        }),
        credentials: 'include',
      });

      if (!verificationResponse.ok) {
        throw new Error('Registration verification failed');
      }

      return await verificationResponse.json();
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
      const optionsResponse = await fetch(`${this.apiBaseUrl}/webauthn/authentication/options`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(userIdentifier ? { user_identifier: userIdentifier } : {}),
        credentials: 'include',
      });

      if (!optionsResponse.ok) {
        throw new Error('Failed to get authentication options');
      }

      const { options } = await optionsResponse.json();

      // 2. Get credentials
      const credential = await navigator.credentials.get({
        publicKey: this.preformatAuthenticationOptions(options),
      }) as PublicKeyCredential;

      // 3. Verify authentication with server
      const verificationResponse = await fetch(`${this.apiBaseUrl}/webauthn/authentication/verify`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          response: this.formatAuthenticationResponse(credential),
        }),
        credentials: 'include',
      });

      if (!verificationResponse.ok) {
        throw new Error('Authentication verification failed');
      }

      return await verificationResponse.json();
    } catch (error) {
      console.error('Passkey authentication failed:', error);
      return {
        success: false,
        error: error instanceof Error ? error.message : 'Authentication failed',
      };
    }
  }

  /**
   * Helper: Convert base64 string to ArrayBuffer
   */
  private base64ToArrayBuffer(base64: string): ArrayBuffer {
    const binaryString = window.atob(base64);
    const bytes = new Uint8Array(binaryString.length);
    for (let i = 0; i < binaryString.length; i++) {
      bytes[i] = binaryString.charCodeAt(i);
    }
    return bytes.buffer;
  }

  /**
   * Helper: Convert ArrayBuffer to base64 string
   */
  private arrayBufferToBase64(buffer: ArrayBuffer): string {
    const binary = String.fromCharCode(...new Uint8Array(buffer));
    return window.btoa(binary);
  }

  /**
   * Helper: Format registration options for the browser
   */
  private preformatRegistrationOptions(
    options: PasskeyRegistrationOptions
  ): PublicKeyCredentialCreationOptions {
    return {
      ...options,
      challenge: this.base64ToArrayBuffer(options.challenge),
      user: {
        ...options.user,
        id: this.base64ToArrayBuffer(options.user.id),
      },
      excludeCredentials: options.excludeCredentials?.map(credential => ({
        ...credential,
        id: this.base64ToArrayBuffer(credential.id),
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
      challenge: this.base64ToArrayBuffer(options.challenge),
      allowCredentials: options.allowCredentials?.map(credential => ({
        ...credential,
        id: this.base64ToArrayBuffer(credential.id),
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
      rawId: this.arrayBufferToBase64(credential.rawId),
      response: {
        attestationObject: this.arrayBufferToBase64(response.attestationObject),
        clientDataJSON: this.arrayBufferToBase64(response.clientDataJSON),
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
      rawId: this.arrayBufferToBase64(credential.rawId),
      response: {
        authenticatorData: this.arrayBufferToBase64(response.authenticatorData),
        clientDataJSON: this.arrayBufferToBase64(response.clientDataJSON),
        signature: this.arrayBufferToBase64(response.signature),
        userHandle: response.userHandle ? this.arrayBufferToBase64(response.userHandle) : undefined,
      },
      type: 'public-key',
      clientExtensionResults: credential.getClientExtensionResults(),
      authenticatorAttachment: (credential.authenticatorAttachment as AuthenticatorAttachment) || undefined,
    };
  }
} 