import { DebugLogger, IdentityEnv } from '@nuwa-ai/identity-kit';
import { IdentityKitWeb } from '@nuwa-ai/identity-kit-web';
import { createHttpClient, type PaymentChannelHttpClient } from '@nuwa-ai/payment-kit/http';

// Cache PaymentChannelHttpClient per host to avoid duplicate instances
const clientsByHost = new Map<string, PaymentChannelHttpClient>();
DebugLogger.setGlobalLevel('debug');
function getHostKey(baseUrl: string): string {
  try {
    return new URL(baseUrl).host;
  } catch (_) {
    return baseUrl;
  }
}

export async function getPaymentClient(sdk: IdentityKitWeb, baseUrl: string): Promise<PaymentChannelHttpClient> {
  const key = getHostKey(baseUrl);
  const existing = clientsByHost.get(key);
  if (existing) return existing;
  console.log('creating payment client for', baseUrl);
  const env = sdk.getIdentityEnv();
  const client = await createHttpClient({
    baseUrl,
    env: ((env as any) as IdentityEnv),
    // optional: max amount per request in picoUSD (default ~ $0.5)
    // maxAmount: BigInt('500000000000'),
    debug: true,
  });
  clientsByHost.set(key, client);
  return client;
}

export async function requestWithPayment(
  sdk: IdentityKitWeb,
  baseUrl: string,
  method: 'GET' | 'POST' | 'PUT' | 'DELETE',
  path: string,
  body?: any,
  headers?: Record<string, string>
) {
  const http = await getPaymentClient(sdk, baseUrl);
  switch (method) {
    case 'GET':
      return http.get(path, { headers });
    case 'POST':
      return http.post(path, body, { headers });
    case 'PUT':
      return http.put(path, body, { headers });
    case 'DELETE':
      return http.delete(path, { headers });
    default:
      return http.post(path, body, { headers });
  }
}

// Raw variant that returns Response for streaming use-cases
export async function requestWithPaymentRaw(
  sdk: IdentityKitWeb,
  baseUrl: string,
  method: 'GET' | 'POST' | 'PUT' | 'DELETE' | 'PATCH',
  path: string,
  body?: any,
  headers?: Record<string, string>
) {
  const http = await getPaymentClient(sdk, baseUrl);
  const initHeaders: Record<string, string> = { ...(headers || {}) };
  let requestBody: any = undefined;
  if (method !== 'GET' && method !== 'DELETE' && body !== undefined) {
    initHeaders['Content-Type'] = initHeaders['Content-Type'] || 'application/json';
    requestBody = typeof body === 'string' ? body : JSON.stringify(body);
  }
  return http.createRequestHandle(method as any, path, {
    headers: initHeaders,
    body: requestBody,
  } as RequestInit);
}

export function resetPaymentClient(baseUrl?: string): void {
  if (!baseUrl) {
    clientsByHost.clear();
    return;
  }
  const key = getHostKey(baseUrl);
  clientsByHost.delete(key);
}


