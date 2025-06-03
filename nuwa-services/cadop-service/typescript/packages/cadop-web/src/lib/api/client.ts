/**
 * Client-side API layer
 * This module provides a unified way to interact with the backend API.
 * All server-side operations are proxied through the backend service.
 */

import { supabase } from '../supabase/config';

interface APIError {
  code: string;
  message: string;
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
  }

  public static getInstance(): APIClient {
    if (!APIClient.instance) {
      APIClient.instance = new APIClient();
    }
    return APIClient.instance;
  }

  private async getAuthHeaders(): Promise<HeadersInit> {
    const session = await supabase.auth.getSession();
    return {
      'Content-Type': 'application/json',
      'Authorization': session.data.session ? `Bearer ${session.data.session.access_token}` : '',
      'X-Client-Type': 'cadop-web'
    };
  }

  private async handleResponse<T>(response: Response): Promise<APIResponse<T>> {
    if (!response.ok) {
      const error = await response.json().catch(() => ({ message: 'Unknown error' }));
      return {
        error: {
          code: response.status.toString(),
          message: error.message || `HTTP error ${response.status}`,
          details: error
        }
      };
    }

    const data = await response.json();
    return { data };
  }

  public async get<T>(endpoint: string, params?: Record<string, string>): Promise<APIResponse<T>> {
    const url = new URL(`${this.baseUrl}${endpoint}`);
    if (params) {
      Object.entries(params).forEach(([key, value]) => {
        url.searchParams.append(key, value);
      });
    }

    const response = await fetch(url.toString(), {
      method: 'GET',
      headers: await this.getAuthHeaders()
    });

    return this.handleResponse<T>(response);
  }

  public async post<T>(endpoint: string, data: unknown): Promise<APIResponse<T>> {
    const response = await fetch(`${this.baseUrl}${endpoint}`, {
      method: 'POST',
      headers: await this.getAuthHeaders(),
      body: JSON.stringify(data)
    });

    return this.handleResponse<T>(response);
  }

  public async put<T>(endpoint: string, data: unknown): Promise<APIResponse<T>> {
    const response = await fetch(`${this.baseUrl}${endpoint}`, {
      method: 'PUT',
      headers: await this.getAuthHeaders(),
      body: JSON.stringify(data)
    });

    return this.handleResponse<T>(response);
  }

  public async delete<T>(endpoint: string): Promise<APIResponse<T>> {
    const response = await fetch(`${this.baseUrl}${endpoint}`, {
      method: 'DELETE',
      headers: await this.getAuthHeaders()
    });

    return this.handleResponse<T>(response);
  }
}

export const apiClient = APIClient.getInstance(); 