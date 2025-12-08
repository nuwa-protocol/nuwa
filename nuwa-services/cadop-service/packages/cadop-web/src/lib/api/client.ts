/**
 * Client-side API layer
 * This module provides a unified way to interact with the backend API.
 * All server-side operations are proxied through the backend service.
 */

import type { APIResponse, AgentDIDCreationStatus } from '@cadop/shared';
import { createErrorResponse } from '@cadop/shared';
import { API_URL } from '../../config/env';
import type { DIDDocument } from '@nuwa-ai/identity-kit';

class APIClient {
  private static instance: APIClient;
  private baseUrl: string;

  private constructor() {
    this.baseUrl = API_URL;
    console.debug('APIClient initialized with baseUrl:', this.baseUrl);
  }

  public static getInstance(): APIClient {
    if (!APIClient.instance) {
      APIClient.instance = new APIClient();
    }
    return APIClient.instance;
  }

  private async getAuthHeaders(): Promise<HeadersInit> {
    const headers = {
      'Content-Type': 'application/json',
      'X-Client-Type': 'cadop-web',
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
      return createErrorResponse(
        responseData?.message || responseData?.error || `HTTP error ${response.status}`,
        responseData?.code
      );
    }

    return { data: responseData.data };
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
      params,
    });

    const response = await fetch(url.toString(), {
      method: 'GET',
      headers: await this.getAuthHeaders(),
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

      return this.handleResponse<T>(response);
    } catch (error) {
      console.error('API request failed:', error);
      return createErrorResponse(
        error instanceof Error ? error.message : 'Request failed',
        'REQUEST_FAILED'
      );
    }
  }

  public async put<T>(endpoint: string, data: unknown): Promise<APIResponse<T>> {
    const url = `${this.baseUrl}${endpoint}`;
    console.debug('PUT Request:', {
      url,
      data,
    });

    const response = await fetch(url, {
      method: 'PUT',
      headers: await this.getAuthHeaders(),
      body: JSON.stringify(data),
    });

    return this.handleResponse<T>(response);
  }

  public async delete<T>(endpoint: string): Promise<APIResponse<T>> {
    const url = `${this.baseUrl}${endpoint}`;
    console.debug('DELETE Request:', {
      url,
    });

    const response = await fetch(url, {
      method: 'DELETE',
      headers: await this.getAuthHeaders(),
    });

    return this.handleResponse<T>(response);
  }
}

/**
 * Custodian specific API client
 */
export class CustodianAPIClient {
  constructor(private apiClient: APIClient) {}

  /**
   * Create a new Agent DID via CADOP protocol
   */
  async mint(params: {
    idToken: string;
    userDid: string;
  }): Promise<APIResponse<AgentDIDCreationStatus>> {
    return this.apiClient.post('/api/custodian/mint', params);
  }
}

export const apiClient = APIClient.getInstance();
export const custodianClient = new CustodianAPIClient(apiClient);
