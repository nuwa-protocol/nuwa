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

  // Billable: non-stream chat completions using FinalCost (post-flight)
  billing.post('/api/v1/chat/completions', { pricing: { type: 'FinalCost' } }, async (req: Request, res: Response) => {
    const handler = deps?.handleNonStreamLLM || defaultHandleNonStreamLLM;
    const result = await handler(req);
    const totalCostUSD = result?.usage?.cost ?? 0;
    const pico = Math.round(Number(totalCostUSD) * 1e12);
    (res as any).locals.usage = pico; // USD -> picoUSD
    logger.debug('[gateway] usage from provider:', result?.usage, 'picoUSD=', pico);
    res.status(result.status).json(result.body);
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


