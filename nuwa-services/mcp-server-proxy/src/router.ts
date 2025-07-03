/**
 * MCP Server Proxy - Router Module
 */
import { FastifyRequest } from 'fastify';
import { RouteConfig, RequestContext } from './types.js';

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
    // Match by hostname
    if (route.matchHostname && hostname === route.matchHostname) {
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
  request.ctx = {
    ...request.ctx,
    upstream,
  };
} 