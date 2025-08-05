/**
 * MCP Server Proxy - Router Module
 */
import { FastifyRequest } from 'fastify';
import { performance } from 'node:perf_hooks';
import { RouteConfig } from './types.js';

/**
 * Determines the appropriate upstream for a request based on routing rules
 * @param request The Fastify request
 * @param routes Array of route configurations
 * @param defaultUpstream Default upstream to use if no route matches
 * @returns The name of the upstream to use
 */
export function determineUpstream(
  request: FastifyRequest,
  routes: RouteConfig[],
  defaultUpstream: string
): string {
  const hostname = request.hostname;

  // Check each route rule for hostname match
  for (const route of routes) {
    if (!route.hostname) continue;

    // 1) Exact match
    if (hostname === route.hostname) {
      return route.upstream;
    }

    // 2) Prefix (startsWith) match – allows writing "amap." to match
    //    "amap.mcpproxy.xyz", etc. This keeps configuration simple while
    //    providing flexibility for wildcard-like routing.
    if (hostname.startsWith(route.hostname)) {
      return route.upstream;
    }
  }

  // Fall back to default upstream
  return defaultUpstream;
}

/**
 * Updates the request context with the determined upstream
 * @param request The Fastify request
 * @param upstream The upstream name
 */
export function setUpstreamInContext(request: FastifyRequest, upstream: string): void {
  if (!request.ctx) {
    request.ctx = {
      upstream,
      startTime: performance.now(),
      timings: {},
    } as any;
  } else {
    request.ctx = {
      ...request.ctx,
      upstream,
    };
  }
} 