import { createDidAuthHeader } from './authHeader';
import { AgentKeyMaterial } from './types';

export interface SignedHttpRequestInput {
  did: string;
  key: AgentKeyMaterial;
  method: string;
  url: string;
  body?: string;
  audience?: string;
  headers?: Record<string, string>;
}

export interface SignedHttpResponse {
  status: number;
  statusText: string;
  body: string;
  authorization: string;
}

export async function sendDidAuthRequest(input: SignedHttpRequestInput): Promise<SignedHttpResponse> {
  const authorization = await createDidAuthHeader({
    did: input.did,
    key: input.key,
    method: input.method,
    url: input.url,
    body: input.body,
    audience: input.audience,
  });

  const headers = new Headers();
  headers.set('Authorization', authorization);

  if (input.body && !hasContentType(input.headers)) {
    headers.set('Content-Type', 'application/json');
  }
  for (const [key, value] of Object.entries(input.headers || {})) {
    headers.set(key, value);
  }

  const response = await fetch(input.url, {
    method: input.method.toUpperCase(),
    headers,
    body: input.body,
  });

  return {
    status: response.status,
    statusText: response.statusText,
    body: await response.text(),
    authorization,
  };
}

function hasContentType(headers?: Record<string, string>): boolean {
  if (!headers) return false;
  return Object.keys(headers).some(name => name.toLowerCase() === 'content-type');
}

