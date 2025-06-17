/**
 * Client-side API layer
 * This module provides a unified way to interact with the backend API.
 * All server-side operations are proxied through the backend service.
 */

import type { APIResponse, AgentDIDCreationStatus } from '@cadop/shared';
import { createErrorResponse } from '@cadop/shared';
import { useAuth } from '../auth/AuthContext';

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

  /**
   * Get DID creation status by record ID
   */
  async getStatus(recordId: string): Promise<APIResponse<AgentDIDCreationStatus>> {
    return this.apiClient.get(`/api/custodian/status/${recordId}`);
  }

  /**
   * Get all Agent DIDs for a user
   */
  async getUserAgentDIDs(userDid: string): Promise<APIResponse<{ dids: string[] }>> {
    return this.apiClient.get(`/api/custodian/user/${userDid}/dids`);
  }

  /**
   * Resolve Agent DID document
   */
  async resolveAgentDID(agentDid: string): Promise<APIResponse<DIDDocument>> {
    return this.apiClient.get(`/api/custodian/resolve/${agentDid}`);
  }

  /**
   * Check if Agent DID exists
   */
  async agentDIDExists(agentDid: string): Promise<APIResponse<{ exists: boolean }>> {
    return this.apiClient.get(`/api/custodian/exists/${agentDid}`);
  }

  /**
   * Get detailed information about an Agent DID
   */
  async getAgentInfo(agentDid: string): Promise<
    APIResponse<{
      did: string;
      sybilLevel: number;
      verificationMethods: string[];
      createdAt: string;
      status: 'active' | 'pending' | 'inactive';
      capabilities: {
        canCreateSubAgents: boolean;
        canManageCredentials: boolean;
      };
    }>
  > {
    return this.apiClient.get(`/api/custodian/agent/${agentDid}`);
  }
}

export const apiClient = APIClient.getInstance();
export const custodianClient = new CustodianAPIClient(apiClient);
