import type { NextFunction, Request, Response } from 'express';
import { randomUUID } from 'crypto';

/**
 * Finalize and log the access log entry for a request.
 * Can be called manually for stream requests or automatically via res events.
 */
export function finalizeAccessLog(req: Request, res: Response, startTime: bigint): void {
  // Prevent duplicate logging
  if ((res as any).locals?._accessLogFinalized) {
    return;
  }
  (res as any).locals._accessLogFinalized = true;

  const end = process.hrtime.bigint();
  const durationMs = Number(end - startTime) / 1e6;

  const log = (res as any).locals?.accessLog || {};

  // Prefer values filled by PaymentKit billing context
  try {
    const bc = (res as any).locals?.billingContext;
    const ctxClient = bc?.meta?.clientTxRef;
    const ctxServer = bc?.state?.serviceTxRef;
    if (ctxClient) {
      log.client_tx_ref = ctxClient;
      log.request_id = ctxClient;
    }
    if (ctxServer) {
      log.server_tx_ref = ctxServer;
    }
    if (typeof bc?.state?.costUsd === 'number') {
      log.total_cost_usd = bc.state.costUsd;
    }
  } catch {}

  // Upstream meta (filled by proxy layer)
  try {
    const up = (res as any).locals?.upstream;
    if (up && typeof up === 'object') {
      Object.assign(log, up);
    }
  } catch {}

  // Extract DID information
  try {
    const didInfo = (req as any).didInfo;
    if (didInfo?.did) {
      log.did = didInfo.did;
    }
    // Fallback to billing context
    const bc = (res as any).locals?.billingContext;
    if (!log.did && bc?.meta?.did) {
      log.did = bc.meta.did;
    }
  } catch {}

  // Extract pricing information from cost result
  try {
    const costResult = (res as any).locals?.costResult;
    if (costResult) {
      log.pricing_source = costResult.source;
      log.pricing_version = costResult.pricingVersion;
      // Also set usage_source for backward compatibility with documentation
      log.usage_source = costResult.source === 'provider' ? 'header' : 'gateway-pricing';
    }
  } catch {}

  // Extract model from request body
  try {
    if (req.body && typeof req.body === 'object') {
      log.model = req.body.model || 'unknown';
    }
  } catch {}

  // Extract token details if available
  try {
    const usage = (res as any).locals?.usageInfo;
    if (usage) {
      log.input_tokens = usage.promptTokens;
      log.output_tokens = usage.completionTokens;
      log.total_tokens = usage.totalTokens;
      // Check for cached tokens (prompt caching feature)
      if (usage.cached_tokens) {
        log.cached_tokens = usage.cached_tokens;
      }
      // Additional token details for Response API
      if (usage.input_tokens_details) {
        log.input_tokens_details = usage.input_tokens_details;
      }
      if (usage.output_tokens_details) {
        log.output_tokens_details = usage.output_tokens_details;
      }
    }
  } catch {}

  // Provider information
  try {
    const up = (res as any).locals?.upstream;
    if (up?.upstream_name) {
      log.provider = up.upstream_name;
    }
  } catch {}

  log.response_time = new Date().toISOString();
  log.duration_ms = Math.round(durationMs);
  log.status_code = res.statusCode;
  log.res_headers_subset = {
    'content-type': res.getHeader('content-type'),
    'x-usage': res.getHeader('x-usage'),
  };

  try {
    // Structured JSON to stdout; ensure no sensitive data is printed
    // eslint-disable-next-line no-console
    console.log(JSON.stringify({ type: 'access_log', ...log }));
  } catch {}
}

export function accessLogMiddleware(req: Request, res: Response, next: NextFunction) {
  const start = process.hrtime.bigint();

  // Prefer explicit client reference from header; otherwise generate a placeholder
  const clientTxRef = (req.headers['x-client-tx-ref'] as string | undefined) || randomUUID();
  res.setHeader('X-Request-Id', clientTxRef);

  // Initialize minimal log envelope
  (res as any).locals = (res as any).locals || {};
  (res as any).locals.accessLog = {
    request_id: clientTxRef,
    client_tx_ref: clientTxRef,
    request_time: new Date().toISOString(),
    method: req.method,
    path: req.path,
    query: req.query,
    is_stream: !!(req.body && (req.body as any).stream),
    client_ip: req.ip,
    user_agent: req.headers['user-agent'],
    referer: req.headers['referer'],
    request_body_size: Number(req.headers['content-length'] || 0),
    req_headers_subset: {
      'content-type': req.headers['content-type'],
      'x-llm-provider': req.headers['x-llm-provider'],
    },
  } as any;

  // Store start time for manual finalization (for stream requests)
  (res as any).locals._accessLogStartTime = start;

  // Auto-finalize on finish/close (for non-stream requests and error cases)
  const autoFinalize = () => finalizeAccessLog(req, res, start);
  res.on('finish', autoFinalize);
  res.on('close', autoFinalize);

  next();
}
