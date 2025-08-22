import express, { Request, Response } from 'express';
import { IdentityKit, DebugLogger } from '@nuwa-ai/identity-kit';
import { createExpressPaymentKitFromEnv, type ExpressPaymentKit } from '@nuwa-ai/payment-kit/express';

// Bridge to existing non-stream LLM handler
import { Router } from 'express';
import SupabaseService from './database/supabase.js';
import OpenRouterService from './services/openrouter.js';
import LiteLLMService from './services/litellm.js';
import { parse } from 'url';
import type { DIDInfo } from './types/index.js';

// Placeholder: you can wire to existing handlers or inline logic
// Expectation: handleNonStreamLLM returns { status: number; body: any; usage?: { cost?: number } }
export type NonStreamHandler = (req: Request) => Promise<{ status: number; body: any; usage?: { cost?: number } }>;
export type UsageQueryHandler = (req: Request, res: Response) => Promise<void>;

const logger = DebugLogger.get('LLM-Gateway');

// ------------------------
// Types for upstream meta and proxy results
// ------------------------
export interface UpstreamMeta {
  upstream_name: string;
  upstream_method: string;
  upstream_path: string;
  upstream_status_code?: number;
  upstream_duration_ms?: number;
  upstream_request_id?: string;
  upstream_headers_subset?: Record<string, any>;
  upstream_streamed?: boolean;
  upstream_bytes?: number;
  upstream_cost_usd?: number;
}

interface ProxyResult {
  status: number;
  body?: any;
  error?: string;
  usageUsd?: number;
  meta: UpstreamMeta;
}

export async function initPaymentKitAndRegisterRoutes(app: express.Application, deps?: {
  handleNonStreamLLM?: NonStreamHandler;
  registerUsageHandler?: UsageQueryHandler;
}): Promise<ExpressPaymentKit> {
  const env = await IdentityKit.bootstrap({
    method: 'rooch',
    vdrOptions: {
      rpcUrl: process.env.ROOCH_NODE_URL,
      network: process.env.ROOCH_NETWORK || 'test',
    },
  });

  const serviceKey = process.env.SERVICE_KEY;
  if (!serviceKey) throw new Error('SERVICE_KEY is required');
  await env.keyManager.importKeyFromString(serviceKey);

  const billing = await createExpressPaymentKitFromEnv(env as any, {
    serviceId: 'llm-gateway',
    defaultAssetId: process.env.DEFAULT_ASSET_ID || '0x3::gas_coin::RGas',
    defaultPricePicoUSD: '0',
    adminDid: process.env.ADMIN_DID?.split(',') || [],
    debug: process.env.DEBUG === 'true',
    claim: {
      policy: {
        minClaimAmount: BigInt(process.env.MIN_CLAIM_AMOUNT || '100000000'),
        maxConcurrentClaims: Number(process.env.MAX_CONCURRENT_CLAIMS || '5'),
        maxRetries: Number(process.env.MAX_RETRIES || '3'),
        retryDelayMs: Number(process.env.RETRY_DELAY_MS || '60000'),
      },
    },
  });

  if (process.env.DEBUG === 'true') {
    DebugLogger.setGlobalLevel('debug');
    logger.setLevel('debug');
  }

  // --- Helpers shared by stream/non-stream branches (moved to module scope) ---

  async function proxyStream(req: Request, res: Response): Promise<void> {
    const didInfo = (req as any).didInfo as DIDInfo;
    if (!didInfo?.did) {
      res.status(401).json({ success: false, error: 'Unauthorized' });
      return;
    }

    const apiPath = normalizeApiPath(req);
    const { isLiteLLM, provider, providerName } = (() => {
      const r = resolveProvider(req);
      return { ...r, providerName: r.isLiteLLM ? 'litellm' : 'openrouter' };
    })();

    // Build payload; for OpenRouter, enable usage tracking in stream too
    const baseBody = getRequestData(req) ? { ...(req.body || {}), stream: true } : undefined;
    const requestData = !baseBody
      ? undefined
      : isLiteLLM
      ? baseBody
      : { ...baseBody, usage: { include: true, ...(baseBody as any).usage } };

    const apiKey = await ensureUserApiKey(didInfo.did, isLiteLLM);
    if (!apiKey) {
      res.status(404).json({ success: false, error: 'User API key not found' });
      return;
    }

    res.setHeader('Content-Type', 'text/event-stream');
    res.setHeader('Cache-Control', 'no-cache');
    res.setHeader('Connection', 'keep-alive');
    res.setHeader('Transfer-Encoding', 'chunked');

    const meta: UpstreamMeta = {
      upstream_name: providerName,
      upstream_method: 'POST',
      upstream_path: apiPath,
      upstream_streamed: true,
    };

    const started = Date.now();
    try {
      const upstream = await provider.forwardRequest(apiKey, apiPath, 'POST', requestData, true) as any;
      if (!upstream || 'error' in upstream) {
        const status = (upstream as any)?.status || 502;
        const errMsg = (upstream as any)?.error || 'Upstream error';
        const d = (upstream as any)?.details || {};
        const safeDetails = {
          code: d.code,
          type: d.type,
          requestId: d.requestId,
          statusText: d.statusText,
        } as any;
        try {
          if (upstream && (upstream as any).details) {
            logger.error('[gateway][stream] upstream error details:', (upstream as any).details);
          }
        } catch {}
        meta.upstream_status_code = status;
        meta.upstream_duration_ms = Date.now() - started;
        (res as any).locals.upstream = meta;
        try {
          res.status(status);
          // Emit an OpenAI-style SSE data frame with error payload, then a DONE sentinel
          const payload = { error: { message: errMsg, type: safeDetails.type, code: safeDetails.code, status } };
          res.write(`data: ${JSON.stringify(payload)}\n\n`);
          res.write('data: [DONE]\n\n');
        } catch {}
        try { res.end(); } catch {}
        return;
      }

      let usageUsd = 0;
      let bytes = 0;
      let closed = false;
      upstream.data.on('data', (chunk: Buffer) => {
        bytes += chunk.length;
        const s = chunk.toString();
        try {
          if (s.includes('"usage"')) {
            const lines = s.split('\n');
            for (const line of lines) {
              const trimmed = line.trim();
              if (trimmed === 'data: [DONE]') {
                (res as any).locals.usage = Math.round(Number(usageUsd || 0) * 1e12);
                if (!closed && !res.destroyed) {
                  closed = true;
                  try { res.end(); } catch {}
                  try { upstream.data.destroy(); } catch {}
                }
                break;
              }
              if (line.startsWith('data: ') && line.includes('"usage"')) {
                const obj = JSON.parse(line.slice(6));
                if (obj?.usage?.cost) usageUsd = obj.usage.cost;
              }
            }
          }
        } catch {}
        if (!closed && !res.destroyed) {
          res.write(chunk);
        }
      });
      upstream.data.on('end', () => {
        (res as any).locals.usage = Math.round(Number(usageUsd || 0) * 1e12);
        meta.upstream_bytes = bytes;
        meta.upstream_cost_usd = usageUsd || undefined;
        meta.upstream_status_code = upstream.status;
        meta.upstream_duration_ms = Date.now() - started;
        (res as any).locals.upstream = meta;
        if (!closed && !res.destroyed) {
          closed = true;
          res.end();
        }
      });
      upstream.data.on('error', (err: any) => {
        meta.upstream_bytes = bytes;
        meta.upstream_status_code = upstream.status;
        meta.upstream_duration_ms = Date.now() - started;
        (res as any).locals.upstream = meta;
        try { logger.error('[gateway][stream] upstream stream error:', err); } catch {}
        if (!closed) {
          closed = true;
          try {
            // best-effort SSE error frame in OpenAI-compatible shape
            const payload = { error: { message: 'Upstream stream error', status: upstream.status } } as any;
            res.write(`data: ${JSON.stringify(payload)}\n\n`);
            res.write('data: [DONE]\n\n');
          } catch {}
          try { res.end(); } catch {}
        }
      });
      res.on('close', () => {
        try { upstream.data.destroy(); } catch {}
      });
    } catch (e) {
      meta.upstream_duration_ms = Date.now() - started;
      (res as any).locals.upstream = meta;
      logger.error('Error in /api/v1/chat/completions handler:', e);
      if (!res.headersSent) res.status(500).end();
    }
  }

  const ensureUserApiKey = async (did: string, isLiteLLM: boolean): Promise<string | null> => {
    // try fetch existing key
    let apiKey = await supabaseService.getUserActualApiKey(did, isLiteLLM ? 'litellm' : 'openrouter');
    if (apiKey) return apiKey;
    // auto-create (match non-stream semantics)
    const keyName = `nuwa-generated-did_${did}`;
    if (isLiteLLM) {
      const created = await litellmProvider.createApiKey({ name: keyName });
      if (created && created.key) {
        const ok = await supabaseService.createUserApiKey(
          did,
          created.key,
          created.key,
          keyName,
          'litellm'
        );
        if (ok) apiKey = created.key;
      }
    } else {
      const created = await openrouterProvider.createApiKey({ name: keyName });
      if (created && created.key) {
        const ok = await supabaseService.createUserApiKey(
          did,
          created.data?.hash || created.key,
          created.key,
          keyName,
          'openrouter'
        );
        if (ok) apiKey = created.key;
      }
    }
    return apiKey || null;
  };

  // Billable: chat completions (non-stream and stream in one path, controlled by body.stream)
  billing.post('/api/v1/chat/completions', { pricing: { type: 'FinalCost' } }, async (req: Request, res: Response) => {
    const isStream = !!(req.body && (req.body as any).stream);

    if (!isStream) {
      // Non-stream branch (FinalCost post-flight)
      const result = await proxyNonStream(req);
      (res as any).locals.upstream = result.meta;
      const totalCostUSD = result.usageUsd ?? 0;
      const pico = Math.round(Number(totalCostUSD) * 1e12);
      (res as any).locals.usage = pico; // USD -> picoUSD for PaymentKit
      logger.debug('[gateway] usage from provider:', { cost: totalCostUSD }, 'picoUSD=', pico);
      if (result.error) {
        res.status(result.status).json({ success: false, error: result.error });
        return;
      }
      res.status(result.status).json(result.body);
      return;
    }

    await proxyStream(req, res);
  }, 'llm.chat.completions');

  // Free: usage route, still requires DID auth via PaymentKit
  billing.get('/usage', { pricing: '0', authRequired: true }, async (req: Request, res: Response) => {
    const handler = deps?.registerUsageHandler || defaultUsageHandler;
    await handler(req, res);
  }, 'usage.get');

  app.use(billing.router);
  return billing;
}

// ------------------------
// Default handlers (non-stream, usage)
// ------------------------

const supabaseService = new SupabaseService();
const openrouterProvider = new OpenRouterService();
const litellmProvider = new LiteLLMService();

// Module-scope helpers for non-stream proxy (do not rely on inner closures)
function normalizeApiPath(req: Request): string {
  const { pathname } = parse(req.url);
  let apiPath = (pathname || '').replace(/^\/api\/v1(?=\/?)/, '') || '/';
  if (!apiPath.startsWith('/')) apiPath = '/' + apiPath;
  return apiPath;
}

function getRequestData(req: Request): any | undefined {
  const method = req.method;
  return ['GET', 'DELETE'].includes(method) ? undefined : req.body;
}

function resolveProvider(req: Request) {
  const providerHeader = (req.headers['x-llm-provider'] as string | undefined)?.toLowerCase();
  let backendEnvVar = (process.env.LLM_BACKEND || 'both').toLowerCase();
  if (backendEnvVar === 'both') backendEnvVar = 'openrouter';
  const providerName = providerHeader || backendEnvVar;
  const isLiteLLM = providerName === 'litellm';
  const provider = isLiteLLM ? litellmProvider : openrouterProvider;
  return { providerName, isLiteLLM, provider } as const;
}

export const defaultHandleNonStreamLLM: NonStreamHandler = async (req: Request) => {
  const didInfo = (req as any).didInfo as DIDInfo;
  if (!didInfo?.did) {
    return { status: 401, body: { success: false, error: 'Unauthorized' } };
  }

  // Only pathname part, and normalize by stripping leading /api/v1 so providers receive pure endpoint path
  const { pathname } = parse(req.url);
  let apiPath = pathname || '';
  // Strip prefix '/api/v1' added by billing route so OpenRouter receives '/chat/completions'
  apiPath = apiPath.replace(/^\/api\/v1(?=\/?)/, '') || '/';
  if (!apiPath.startsWith('/')) apiPath = '/' + apiPath;
  const method = req.method;

  // Provider selection
  const providerHeader = (req.headers['x-llm-provider'] as string | undefined)?.toLowerCase();
  let backendEnvVar = (process.env.LLM_BACKEND || 'both').toLowerCase();
  if (backendEnvVar === 'both') backendEnvVar = 'openrouter';
  const providerName = providerHeader || backendEnvVar;
  const isLiteLLM = providerName === 'litellm';

  // Payload (non-stream)
  const requestData = ['GET', 'DELETE'].includes(method) ? undefined : req.body;

  // Get user API key; if missing, auto-create like original middleware
  let apiKey = await supabaseService.getUserActualApiKey(
    didInfo.did,
    isLiteLLM ? 'litellm' : 'openrouter'
  );
  if (!apiKey) {
    const keyName = `nuwa-generated-did_${didInfo.did}`;
    if (isLiteLLM) {
      // Create LiteLLM key via master key
      const created = await litellmProvider.createApiKey({ name: keyName });
      if (created && created.key) {
        const ok = await supabaseService.createUserApiKey(
          didInfo.did,
          created.key, // provider_key_id – LiteLLM may not return a separate id
          created.key,
          keyName,
          'litellm'
        );
        if (ok) {
          apiKey = created.key;
        }
      }
    } else {
      const created = await openrouterProvider.createApiKey({ name: keyName });
      if (created && created.key) {
        const ok = await supabaseService.createUserApiKey(
          didInfo.did,
          created.data?.hash || created.key,
          created.key,
          keyName,
          'openrouter'
        );
        if (ok) {
          apiKey = created.key;
        }
      }
    }
    if (!apiKey) {
      return { status: 404, body: { success: false, error: 'User API key not found' } };
    }
  }

  // Forward
  const provider = isLiteLLM ? litellmProvider : openrouterProvider;
  let finalRequestData = requestData;
  // Per OpenRouter usage accounting docs, inject usage.include=true to receive usage in response
  // https://openrouter.ai/docs/use-cases/usage-accounting
  if (!isLiteLLM) {
    // Only applies to OpenRouter paths (non-stream here)
    if (!finalRequestData || typeof finalRequestData !== 'object') {
      finalRequestData = {};
    }
    const prev = (finalRequestData as any).usage;
    if (!prev || prev.include !== true) {
      (finalRequestData as any).usage = { include: true };
      logger.debug('[gateway] injected usage.include=true for OpenRouter request');
    }
  }

  const response: any = await provider.forwardRequest(
    apiKey,
    apiPath,
    method,
    finalRequestData,
    false
  );

  if (!response) {
    return { status: 502, body: { success: false, error: 'Failed to process request' } };
  }

  if ('error' in response) {
    return { status: response.status || 500, body: { success: false, error: response.error } };
  }

  const responseData = provider.parseResponse(response);

  // Extract provider-reported USD cost if available
  const usageCostUSD: number | undefined = responseData?.usage?.cost;

  return {
    status: response.status,
    body: responseData,
    usage: typeof usageCostUSD === 'number' ? { cost: usageCostUSD } : undefined,
  };
};

// Unified non-stream proxy using providers and upstream meta
async function proxyNonStream(req: Request): Promise<ProxyResult> {
  const didInfo = (req as any).didInfo as DIDInfo;
  if (!didInfo?.did) {
    return { status: 401, error: 'Unauthorized', meta: {
      upstream_name: 'unknown', upstream_method: req.method, upstream_path: normalizeApiPath(req)
    } } as ProxyResult;
  }

  const apiPath = normalizeApiPath(req);
  const { isLiteLLM, provider } = resolveProvider(req);
  const providerName = isLiteLLM ? 'litellm' : 'openrouter';
  const meta: UpstreamMeta = {
    upstream_name: providerName,
    upstream_method: req.method,
    upstream_path: apiPath,
    upstream_streamed: false,
  };

  // Payload (non-stream)
  let finalRequestData = getRequestData(req);
  if (!isLiteLLM) {
    if (!finalRequestData || typeof finalRequestData !== 'object') finalRequestData = {};
    const prev = (finalRequestData as any).usage;
    if (!prev || prev.include !== true) (finalRequestData as any).usage = { include: true };
  }

  // Get or create API key
  let apiKey = await supabaseService.getUserActualApiKey(didInfo.did, isLiteLLM ? 'litellm' : 'openrouter');
  if (!apiKey) {
    const keyName = `nuwa-generated-did_${didInfo.did}`;
    if (isLiteLLM) {
      const created = await litellmProvider.createApiKey({ name: keyName });
      if (created && created.key) {
        const ok = await supabaseService.createUserApiKey(
          didInfo.did,
          created.key,
          created.key,
          keyName,
          'litellm'
        );
        if (ok) apiKey = created.key;
      }
    } else {
      const created = await openrouterProvider.createApiKey({ name: keyName });
      if (created && created.key) {
        const ok = await supabaseService.createUserApiKey(
          didInfo.did,
          created.data?.hash || created.key,
          created.key,
          keyName,
          'openrouter'
        );
        if (ok) apiKey = created.key;
      }
    }
    if (!apiKey) {
      return { status: 404, error: 'User API key not found', meta };
    }
  }

  const started = Date.now();
  const resp: any = await provider.forwardRequest(apiKey, apiPath, req.method, finalRequestData, false);
  meta.upstream_duration_ms = Date.now() - started;

  if (!resp) {
    meta.upstream_status_code = 502;
    return { status: 502, error: 'Failed to process request', meta };
  }
  if ('error' in resp) {
    meta.upstream_status_code = resp.status || 500;
    return { status: resp.status || 500, error: resp.error, meta };
  }

  meta.upstream_status_code = resp.status;
  try {
    const hdrs = resp.headers || {};
    meta.upstream_headers_subset = {
      'x-usage': hdrs['x-usage'],
      'x-ratelimit-limit': hdrs['x-ratelimit-limit'],
      'x-ratelimit-remaining': hdrs['x-ratelimit-remaining'],
    };
  } catch {}

  const responseData = provider.parseResponse(resp);
  const usageCostUSD: number | undefined = responseData?.usage?.cost;
  return {
    status: resp.status,
    body: responseData,
    usageUsd: typeof usageCostUSD === 'number' ? usageCostUSD : undefined,
    meta,
  };
}

export const defaultUsageHandler: UsageQueryHandler = async (req: Request, res: Response) => {
  const didInfo = (req as any).didInfo as DIDInfo;
  if (!didInfo?.did) {
    res.status(401).json({ success: false, error: 'Unauthorized' });
    return;
  }
  const { start_date, end_date } = req.query as { start_date?: string; end_date?: string };
  const usageStats = await supabaseService.getUserUsageStats(didInfo.did, start_date, end_date);
  if (!usageStats) {
    res.status(500).json({ success: false, error: 'Failed to get usage statistics' });
    return;
  }
  res.json({ success: true, data: usageStats });
};


