import { DebugLogger, DIDAuth } from '@nuwa-ai/identity-kit';
import { useAuth } from '../App';

const STORAGE_KEY = 'nuwa-login-demo:gateway-url';
const DEFAULT_GATEWAY_URL = 'https://test-llm.nuwa.dev';

DebugLogger.setGlobalLevel('debug');

export function getGatewayUrl(): string {
  return localStorage.getItem(STORAGE_KEY) || DEFAULT_GATEWAY_URL;
}

export function setGatewayUrl(url: string): void {
  localStorage.setItem(STORAGE_KEY, url);
}

export interface GatewayRequestOptions {
  method: 'GET' | 'POST' | 'PUT' | 'DELETE';
  path: string; // e.g. /api/v1/chat/completions
  body?: string; // raw JSON string (will be sent as-is for non-GET)
  headers?: Record<string, string>; // extra headers e.g. { 'X-LLM-Provider': 'litellm' }
}

// This function will be used inside a React component that has access to the auth context
export async function sendSignedRequest(
  gatewayBaseUrl: string,
  options: GatewayRequestOptions,
  sign: ReturnType<typeof useAuth>['sign']
): Promise<{ status: number; headers: Record<string, string>; body: string }> {
  // Prefer payment-channel HTTP client – we need sdk from the hook caller context.
  // Here we cannot access sdk; so we fall back to plain DIDAuth path.

  const payload = {
    operation: 'gateway-debug',
    params: { method: options.method, path: options.path },
  } as const;

  // Use the sign function from the hook
  const signatureObj = await sign(payload);
  const authHeader = DIDAuth.v1.toAuthorizationHeader(signatureObj);

  const url = new URL(options.path, gatewayBaseUrl).toString();

  const headerObj: Record<string, string> = {
    Authorization: authHeader,
    'Content-Type': 'application/json',
    ...(options.headers || {}),
  };

  const fetchOptions: RequestInit = {
    method: options.method,
    headers: headerObj,
  };
  if (options.method !== 'GET' && options.method !== 'DELETE' && options.body) {
    fetchOptions.body = options.body;
  }

  const res = await fetch(url, fetchOptions);
  const text = await res.text();
  const headersObj: Record<string, string> = {};
  res.headers.forEach((v, k) => {
    headersObj[k] = v;
  });
  return { status: res.status, headers: headersObj, body: text };
}
