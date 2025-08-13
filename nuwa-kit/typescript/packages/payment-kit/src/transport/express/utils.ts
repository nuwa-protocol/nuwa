import type { Request } from 'express';

/**
 * Determine whether the current HTTP request should be treated as streaming.
 *
 * Heuristics:
 * - Explicit route option: rule.streaming === true
 * - Body flag: body.stream === true
 * - Query flag: ?stream=true
 * - Path hint: contains ':stream' suffix
 */
export function isStreamingRequest(req: Request, rule?: { streaming?: boolean }): boolean {
  const routeStreaming = !!(rule as any)?.streaming;
  const bodyStreaming = typeof req.body === 'object' && !!(req as any).body?.stream === true;
  const queryStreaming =
    typeof req.query === 'object' &&
    (((req.query as any).stream as any) === 'true' || ((req.query as any).stream as any) === true);
  const pathStreaming = typeof req.path === 'string' && req.path.includes(':stream');
  return routeStreaming || bodyStreaming || queryStreaming || pathStreaming;
}
