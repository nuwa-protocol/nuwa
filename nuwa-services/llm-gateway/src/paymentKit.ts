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
  });

  if (process.env.DEBUG === 'true') {
    DebugLogger.setGlobalLevel('debug');
    logger.setLevel('debug');
  }

  // --- Helpers shared by stream/non-stream branches ---
  const resolveProvider = (req: Request) => {
    const providerHeader = (req.headers['x-llm-provider'] as string | undefined)?.toLowerCase();
    let backendEnvVar = (process.env.LLM_BACKEND || 'both').toLowerCase();
    if (backendEnvVar === 'both') backendEnvVar = 'openrouter';
    const providerName = providerHeader || backendEnvVar;
    const isLiteLLM = providerName === 'litellm';
    const provider = isLiteLLM ? litellmProvider : openrouterProvider;
    return { providerName, isLiteLLM, provider } as const;
  };

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
      const handler = deps?.handleNonStreamLLM || defaultHandleNonStreamLLM;
      const result = await handler(req);
      const totalCostUSD = result?.usage?.cost ?? 0;
      const pico = Math.round(Number(totalCostUSD) * 1e12);
      (res as any).locals.usage = pico; // USD -> picoUSD
      logger.debug('[gateway] usage from provider:', result?.usage, 'picoUSD=', pico);
      res.status(result.status).json(result.body);
      return;
    }

    // Stream branch (SSE)
    const didInfo = (req as any).didInfo as DIDInfo;
    if (!didInfo?.did) {
      res.status(401).json({ success: false, error: 'Unauthorized' });
      return;
    }

    const { pathname } = parse(req.url);
    let apiPath = (pathname || '').replace(/^\/api\/v1(?=\/?)/, '') || '/';
    if (!apiPath.startsWith('/')) apiPath = '/' + apiPath;

    const { isLiteLLM, provider } = resolveProvider(req);
    // Build payload; for OpenRouter, enable usage tracking in stream too
    const baseBody = ['GET', 'DELETE'].includes(req.method) ? undefined : { ...(req.body || {}), stream: true };
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

    try {
      const upstream = await provider.forwardRequest(apiKey, apiPath, 'POST', requestData, true);
      if (!upstream || 'error' in upstream) {
        res.status((upstream as any)?.status || 502).end();
        return;
      }

      let usageUsd = 0;
      let closed = false;
      upstream.data.on('data', (chunk: Buffer) => {
        const s = chunk.toString();
        try {
          if (s.includes('"usage"')) {
            const lines = s.split('\n');
            for (const line of lines) {
              const trimmed = line.trim();
              if (trimmed === 'data: [DONE]') {
                // finalize immediately on DONE
                (res as any).locals.usage = Math.round(Number(usageUsd || 0) * 1e12);
                if (!closed && !res.destroyed) {
                  closed = true;
                  try { res.end(); } catch (err) { console.error('Error ending response:', err); }
                  try { upstream.data.destroy(); } catch (err) { console.error('Error destroying upstream data stream:', err); }
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
        if (!closed && !res.destroyed) {
          closed = true;
          res.end();
        }
      });
      upstream.data.on('error', () => {
        if (!closed && !res.headersSent) {
          closed = true;
          res.status(500).end();
        }
      });
      res.on('close', () => {
        upstream.data.destroy();
      });
    } catch (e) {
      logger.error('Error in /api/v1/chat/completions handler:', e);
      if (!res.headersSent) res.status(500).end();
    }
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


