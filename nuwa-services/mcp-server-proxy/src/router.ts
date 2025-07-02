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
  const { ctx } = request;
  const callerDid = ctx?.callerDid;
  const toolName = extractToolName(request);
  const hostname = request.hostname;

  // Store tool name in context for later use (e.g., billing)
  if (toolName) {
    request.ctx = {
      ...request.ctx,
      toolName,
    };
  }

  // Check each route rule in order
  for (const route of routes) {
    // Match by tool name
    if (route.matchTool && toolName === route.matchTool) {
      return route.upstream;
    }

    // Match by DID prefix
    if (route.matchDidPrefix && callerDid?.startsWith(route.matchDidPrefix)) {
      return route.upstream;
    }

    // Match by hostname
    if (route.matchHostname && hostname === route.matchHostname) {
      return route.upstream;
    }
  }

  // Fall back to default upstream
  return defaultUpstream;
}

/**
 * Extracts the tool name from a request body
 * @param request The Fastify request
 * @returns The tool name if found, otherwise undefined
 */
export function extractToolName(request: FastifyRequest): string | undefined {
  try {
    // For tool.call requests
    if (request.method === 'POST' && request.url.includes('/mcp/tool.call')) {
      const body = request.body as any;
      return body?.name;
    }

    // For prompt.load requests
    if (request.method === 'POST' && request.url.includes('/mcp/prompt.load')) {
      const body = request.body as any;
      return body?.name;
    }

    // Extract from URL path for resource requests
    const resourceMatch = request.url.match(/\/mcp\/resource\/([^\/\?]+)/);
    if (resourceMatch) {
      return resourceMatch[1];
    }

    return undefined;
  } catch (error) {
    console.error('Error extracting tool name:', error);
    return undefined;
  }
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