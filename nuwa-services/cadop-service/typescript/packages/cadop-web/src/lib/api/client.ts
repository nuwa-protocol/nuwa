/**
 * Client-side API layer
 * This module provides a unified way to interact with the backend API.
 * All server-side operations are proxied through the backend service.
 */

import { supabase } from '../supabase/config';
import type {
  PasskeyRegistrationOptions,
  PasskeyAuthenticationOptions,
  PasskeyRegistrationResponse,
  PasskeyRegistrationResult,
  WebAuthnOptionsResponse,
  WebAuthnAuthenticationResponse,
  WebAuthnAuthenticationResult,
} from '@cadop/shared';

interface APIError {
  message: string;
  code?: string;
  details?: unknown;
}

interface APIResponse<T> {
  data?: T;
  error?: APIError;
}

class APIClient {
  private static instance: APIClient;
  private baseUrl: string;

  private constructor() {
    this.baseUrl = import.meta.env.VITE_API_URL || 'http://localhost:8080';
    console.log('APIClient initialized with baseUrl:', this.baseUrl);
  }

  public static getInstance(): APIClient {
    if (!APIClient.instance) {
      APIClient.instance = new APIClient();
    }
    return APIClient.instance;
  }

  private async getAuthHeaders(): Promise<HeadersInit> {
    const session = await supabase.auth.getSession();
    const headers = {
      'Content-Type': 'application/json',
      'Authorization': session.data.session ? `Bearer ${session.data.session.access_token}` : '',
      'X-Client-Type': 'cadop-web'
    };
    console.debug('Request headers:', headers);
    return headers;
  }

  private async handleResponse<T>(response: Response): Promise<APIResponse<T>> {
    const contentType = response.headers.get('content-type');
    let responseData;
    
    try {
      if (contentType && contentType.includes('application/json')) {
        responseData = await response.json();
      } else {
        responseData = await response.text();
        console.warn('Response is not JSON:', responseData);
      }
    } catch (e) {
      console.error('Failed to parse response:', e);
      responseData = null;
    }

    console.debug('Response status:', response.status);
    console.debug('Response headers:', Object.fromEntries(response.headers.entries()));
    console.debug('Response data:', responseData);

    if (!response.ok) {
      return {
        error: {
          message: responseData?.message || responseData?.error || `HTTP error ${response.status}`,
          code: responseData?.code,
        }
      };
    }

    return { data: responseData };
  }

  public async get<T>(endpoint: string, params?: Record<string, string>): Promise<APIResponse<T>> {
    const url = new URL(`${this.baseUrl}${endpoint}`);
    if (params) {
      Object.entries(params).forEach(([key, value]) => {
        url.searchParams.append(key, value);
      });
    }

    console.debug('GET Request:', {
      url: url.toString(),
      params
    });

    const response = await fetch(url.toString(), {
      method: 'GET',
      headers: await this.getAuthHeaders()
    });

    return this.handleResponse<T>(response);
  }

  public async post<T>(
    endpoint: string,
    data: any,
    options: { skipAuth?: boolean } = {}
  ): Promise<APIResponse<T>> {
    try {
      const headers: Record<string, string> = {
        'Content-Type': 'application/json',
      };

      if (!options.skipAuth) {
        const authHeaders = await this.getAuthHeaders();
        Object.assign(headers, authHeaders);
      }

      const response = await fetch(`${this.baseUrl}${endpoint}`, {
        method: 'POST',
        headers,
        body: JSON.stringify(data),
      });

      const responseData = await response.json();

      if (!response.ok) {
        return {
          data: undefined,
          error: {
            message: responseData.error || 'An error occurred',
            code: responseData.code,
            details: responseData.details,
          },
        };
      }

      return {
        data: responseData as T,
        error: undefined,
      };
    } catch (error) {
      console.error('API request failed:', error);
      return {
        data: undefined,
        error: {
          message: error instanceof Error ? error.message : 'Request failed',
          code: 'REQUEST_FAILED',
        },
      };
    }
  }

  public async put<T>(endpoint: string, data: unknown): Promise<APIResponse<T>> {
    const url = `${this.baseUrl}${endpoint}`;
    console.debug('PUT Request:', {
      url,
      data
    });

    const response = await fetch(url, {
      method: 'PUT',
      headers: await this.getAuthHeaders(),
      body: JSON.stringify(data)
    });

    return this.handleResponse<T>(response);
  }

  public async delete<T>(endpoint: string): Promise<APIResponse<T>> {
    const url = `${this.baseUrl}${endpoint}`;
    console.debug('DELETE Request:', {
      url
    });

    const response = await fetch(url, {
      method: 'DELETE',
      headers: await this.getAuthHeaders()
    });

    return this.handleResponse<T>(response);
  }

  // WebAuthn/Passkey API methods
  public async getRegistrationOptions(
    email: string,
    displayName?: string,
    friendlyName?: string
  ): Promise<APIResponse<{ options: PasskeyRegistrationOptions; user_id: string }>> {
    console.debug('Getting registration options:', {
      email,
      displayName,
      friendlyName
    });
    return this.post('/api/webauthn/registration/options', {
      email,
      display_name: displayName,
      friendly_name: friendlyName,
    });
  }

  public async verifyRegistration(
    response: PasskeyRegistrationResponse,
    friendlyName?: string
  ): Promise<APIResponse<PasskeyRegistrationResult>> {
    console.debug('Verifying registration:', {
      response,
      friendlyName
    });
    return this.post('/api/webauthn/registration/verify', {
      response,
      friendly_name: friendlyName,
    }, { skipAuth: true });
  }

  public async getAuthenticationOptions(userIdentifier?: string): Promise<APIResponse<WebAuthnOptionsResponse>> {
    try {
      const response = await fetch('/api/webauthn/authentication/options', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ user_identifier: userIdentifier }),
      });

      if (!response.ok) {
        const error = await response.json();
        return {
          error: {
            message: error.error_description || error.error || 'Failed to get authentication options',
            code: error.code,
            details: error,
          },
        };
      }

      const data: WebAuthnOptionsResponse = await response.json();
      return { data };
    } catch (error) {
      return {
        error: {
          message: error instanceof Error ? error.message : 'Failed to get authentication options',
          code: 'API_ERROR',
          details: error,
        },
      };
    }
  }

  public async verifyAuthentication(response: WebAuthnAuthenticationResponse): Promise<APIResponse<WebAuthnAuthenticationResult>> {
    try {
      const apiResponse = await fetch('/api/webauthn/authentication/verify', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ response }),
      });

      if (!apiResponse.ok) {
        const error = await apiResponse.json();
        return {
          error: {
            message: error.error_description || error.error || 'Failed to verify authentication',
            code: error.code,
            details: error,
          },
        };
      }

      const data: WebAuthnAuthenticationResult = await apiResponse.json();
      return { data };
    } catch (error) {
      return {
        error: {
          message: error instanceof Error ? error.message : 'Failed to verify authentication',
          code: 'API_ERROR',
          details: error,
        },
      };
    }
  }

  // 开发环境专用方法
  public async resetAuthenticatorCounter(
    credentialId: string
  ): Promise<APIResponse<{ success: boolean; message: string }>> {
    if (process.env.NODE_ENV === 'production') {
      throw new Error('Counter reset not available in production');
    }
    console.debug('Resetting authenticator counter:', { credentialId });
    return this.post('/api/webauthn/dev/reset-counter', { credentialId });
  }

  public async resetUserAuthenticatorCounters(
    userId: string
  ): Promise<APIResponse<{ success: boolean; message: string; resetCount: number }>> {
    if (process.env.NODE_ENV === 'production') {
      throw new Error('Counter reset not available in production');
    }
    console.debug('Resetting user authenticator counters:', { userId });
    return this.post('/api/webauthn/dev/reset-user-counters', { userId });
  }
}

export const apiClient = APIClient.getInstance(); 