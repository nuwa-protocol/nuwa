import type { NextFunction, Request, Response } from 'express';
import { randomUUID } from 'crypto';

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

  let finalized = false;
  const finalize = () => {
    if (finalized) return; finalized = true;
    const end = process.hrtime.bigint();
    const durationMs = Number(end - start) / 1e6;

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

    // Provider and pricing information
    try {
      if (log.provider) {
        // Provider info already set by proxy layer
      }
      if (log.usage_source) {
        // Usage source already set by pricing system
      }
      if (log.pricing_version) {
        // Pricing version already set by pricing system
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
  };

  res.on('finish', finalize);
  res.on('close', finalize);
  next();
}


