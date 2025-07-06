import { StreamableHTTPClientTransport } from '@modelcontextprotocol/sdk/client/streamableHttp.js';
import { StdioClientTransport } from '@modelcontextprotocol/sdk/client/stdio.js';
import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { ServerCapabilities } from '@modelcontextprotocol/sdk/types.js';
import { UpstreamConfig, AuthConfig, Upstream} from './types.js';
import { performance } from 'node:perf_hooks';
import type { FastifyRequest, FastifyReply } from 'fastify';

function buildHeaders(auth?: AuthConfig): Record<string, string> {
  const headers: Record<string, string> = {};
  if (!auth) return headers;

  switch (auth.scheme) {
    case 'header':
      headers[auth.header] = auth.value;
      break;
    case 'basic':
      headers['Authorization'] =
        'Basic ' + Buffer.from(`${auth.username}:${auth.password}`).toString('base64');
      break;
    case 'bearer':
      headers['Authorization'] = `Bearer ${auth.token}`;
      break;
  }
  return headers;
}

export async function initUpstream(name: string, cfg: UpstreamConfig): Promise<Upstream> {
  let transport: any;
  if (cfg.type === 'httpStream' || cfg.type === 'http') {
    transport = new StreamableHTTPClientTransport(new URL(cfg.url), {
      requestInit: { headers: buildHeaders(cfg.auth) },
    } as any);
  } else {
    // cfg here is StdioUpstreamConfig
    const stdioCfg = cfg as any; // type cast for clarity
    transport = new StdioClientTransport({
      command: stdioCfg.command[0],
      args: stdioCfg.command.slice(1),
      cwd: stdioCfg.cwd,
      env: stdioCfg.env,
    });
  }

  const client: any = new Client({ name: `proxy-${name}`, version: '0.1.0' }, {});
  await client.connect(transport);

  // Fetch capabilities after connect using getServerCapabilities
  let capabilities: ServerCapabilities = {};
  try {
    if (typeof client.getServerCapabilities === 'function') {
      capabilities = await client.getServerCapabilities();
    }
  } catch (e) {
    console.warn(`Upstream ${name} getServerCapabilities failed:`, e);
  }

  return { type: cfg.type, client, config: cfg, capabilities };
}

// -----------------------------------------------------------------------------
// Generic helper – wraps an upstream client call with unified logging,
// JSON-RPC/REST response shaping and timing collection.
// -----------------------------------------------------------------------------
async function handleClientCall(
  req: FastifyRequest,
  reply: FastifyReply,
  up: Upstream,
  call: () => Promise<any>,
  stage: string,
  failPrefix: string,
  jsonRpcId?: string | number | null,
) {
  const tUp = performance.now();
  try {
    const result = await call();
    if (jsonRpcId !== undefined) {
      reply.send({ jsonrpc: '2.0', id: jsonRpcId, result });
    } else {
      reply.send(result);
    }
  } catch (error: any) {
    // Pass through JSON-RPC errors untouched so the client can act on them directly.
    if (error && typeof error === 'object' && 'code' in error && 'message' in error) {
      req.log.info(
        {
          reqId: req.id,
          upstream: req.ctx?.upstream,
          rpcMethod: req.ctx?.rpcMethod ?? null,
          code: error.code,
          message: error.message,
          stage,
        },
        'upstream.rpc_error',
      );
      if (jsonRpcId !== undefined) {
        reply.status(500).send({ jsonrpc: '2.0', id: jsonRpcId, error });
      } else {
        reply.status(500).send({ error });
      }
    } else {
      // Unknown / non-JSON-RPC error
      req.log.error(
        {
          reqId: req.id,
          upstream: req.ctx?.upstream,
          rpcMethod: req.ctx?.rpcMethod ?? null,
          err: error,
          stage,
        },
        'upstream.error',
      );
      const message = String(error);
      if (jsonRpcId !== undefined) {
        reply.status(500).send({
          jsonrpc: '2.0',
          id: jsonRpcId,
          error: { code: -32000, message: `${failPrefix} failed: ${message}` },
         });
      } else {
        reply.status(500).send({ error: `${failPrefix} failed`, message });
      }
    }
  } finally {
    if (req.ctx) req.ctx.timings.upstream = Number((performance.now() - tUp).toFixed(3));
  }
}

// ---------- forwarding helper wrappers (used by server.ts) -----------------

// Add optional jsonRpcId parameter to unify REST and JSON-RPC responses
export async function forwardToolList(req: FastifyRequest, reply: FastifyReply, up: Upstream, jsonRpcId?: string | number | null) {
  return handleClientCall(req, reply, up, () => up.client.listTools(), 'forwardToolList', 'listTools', jsonRpcId);
}

export async function forwardToolCall(req: FastifyRequest, reply: FastifyReply, up: Upstream, jsonRpcId?: string | number | null) {
  const body: any = req.body;
  const name = body?.name;
  const args = body?.arguments || {};
  if (!name) {
    if (jsonRpcId !== undefined) {
      return reply.status(400).send({ jsonrpc: '2.0', id: jsonRpcId, error: { code: -32602, message: 'Missing name' } });
    }
    return reply.status(400).send({ error: 'Missing name' });
  }
  return handleClientCall(
    req,
    reply,
    up,
    () => up.client.callTool({ name, arguments: args }),
    'forwardToolCall',
    'callTool',
    jsonRpcId,
  );
}

export async function forwardPromptGet(req: FastifyRequest, reply: FastifyReply, up: Upstream, jsonRpcId?: string | number | null) {
  const body: any = req.body;
  const name = body?.name;
  const args = body?.arguments || {};
  if (!name) {
    if (jsonRpcId !== undefined) {
      return reply.status(400).send({ jsonrpc: '2.0', id: jsonRpcId, error: { code: -32602, message: 'Missing name' } });
    }
    return reply.status(400).send({ error: 'Missing name' });
  }
  return handleClientCall(
    req,
    reply,
    up,
    () => up.client.getPrompt({ name, arguments: args }),
    'forwardPromptGet',
    'promptGet',
    jsonRpcId,
  );
}

export async function forwardPromptList(req: FastifyRequest, reply: FastifyReply, up: Upstream, jsonRpcId?: string | number | null) {
  return handleClientCall(req, reply, up, () => up.client.listPrompts(), 'forwardPromptList', 'listPrompts', jsonRpcId);
}

export async function forwardResourceList(req: FastifyRequest, reply: FastifyReply, up: Upstream, jsonRpcId?: string | number | null) {
  return handleClientCall(req, reply, up, () => up.client.listResources(), 'forwardResourceList', 'listResources', jsonRpcId);
}

export async function forwardResourceTemplateList(req: FastifyRequest, reply: FastifyReply, up: Upstream, jsonRpcId?: string | number | null) {
  return handleClientCall(req, reply, up, () => up.client.listResourceTemplates(), 'forwardResourceTemplateList', 'listResourceTemplates', jsonRpcId);
}

export async function forwardResourceRead(req: FastifyRequest, reply: FastifyReply, up: Upstream, jsonRpcId?: string | number | null) {
  const body: any = req.body;
  const params = body?.params;
  if (!params) {
    if (jsonRpcId !== undefined) {
      return reply.status(400).send({ jsonrpc: '2.0', id: jsonRpcId, error: { code: -32602, message: 'Missing params' } });
    }
    return reply.status(400).send({ error: 'Missing params' });
  }
  return handleClientCall(req, reply, up, () => up.client.readResource(params), 'forwardResourceRead', 'readResource', jsonRpcId);
}