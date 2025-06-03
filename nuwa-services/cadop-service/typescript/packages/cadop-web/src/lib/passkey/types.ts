import type {
  PublicKeyCredentialCreationOptionsJSON,
  PublicKeyCredentialRequestOptionsJSON,
  AuthenticatorAttachment,
  AuthenticatorTransportFuture,
} from '@simplewebauthn/types';

export interface PasskeyRegistrationOptions extends PublicKeyCredentialCreationOptionsJSON {
  challenge: string;
  rp: {
    name: string;
    id: string;
  };
  user: {
    id: string;
    name: string;
    displayName: string;
  };
  pubKeyCredParams: Array<{
    alg: number;
    type: 'public-key';
  }>;
  timeout: number;
}

export interface PasskeyAuthenticationOptions extends PublicKeyCredentialRequestOptionsJSON {
  challenge: string;
  timeout: number;
  rpId: string;
  allowCredentials?: Array<{
    id: string;
    type: 'public-key';
    transports?: AuthenticatorTransportFuture[];
  }>;
}

export interface PasskeyRegistrationResponse {
  id: string;
  rawId: string;
  response: {
    attestationObject: string;
    clientDataJSON: string;
    transports?: AuthenticatorTransportFuture[];
  };
  type: 'public-key';
  clientExtensionResults: Record<string, any>;
  authenticatorAttachment?: AuthenticatorAttachment;
}

export interface PasskeyAuthenticationResponse {
  id: string;
  rawId: string;
  response: {
    authenticatorData: string;
    clientDataJSON: string;
    signature: string;
    userHandle?: string;
  };
  type: 'public-key';
  clientExtensionResults: Record<string, any>;
  authenticatorAttachment?: AuthenticatorAttachment;
}

export interface PasskeyDevice {
  id: string;
  friendly_name?: string;
  credential_id: string;
  transports: AuthenticatorTransportFuture[];
  created_at: string;
}

export interface PasskeyRegistrationResult {
  success: boolean;
  device?: PasskeyDevice;
  error?: string;
  user_id?: string;
}

export interface PasskeyAuthenticationResult {
  success: boolean;
  session?: {
    session_token: string;
    expires_at: string;
    user: {
      id: string;
      email: string;
      display_name: string | null;
      created_at: string;
      updated_at: string;
    };
  };
  error?: string;
} 