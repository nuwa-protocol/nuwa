import { StreamableHTTPClientTransport } from '@modelcontextprotocol/sdk/client/streamableHttp.js';
import { StdioClientTransport } from '@modelcontextprotocol/sdk/client/stdio.js';
import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { ServerCapabilities } from '@modelcontextprotocol/sdk/types.js';
import { UpstreamConfig, AuthConfig, Upstream} from './types.js';
import { performance } from 'node:perf_hooks';

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

// ---------- forwarding helpers (used by server.ts) -----------------
import type { FastifyRequest, FastifyReply } from 'fastify';

// Add optional jsonRpcId parameter to unify REST and JSON-RPC responses
export async function forwardToolList(req: FastifyRequest, reply: FastifyReply, up: Upstream, jsonRpcId?: string | number | null) {
  const tUp = performance.now();
  try {
    const result = await up.client.listTools();
    if (jsonRpcId !== undefined) {
      reply.send({ jsonrpc: '2.0', id: jsonRpcId, result });
    } else {
      reply.send(result);
    }
  } catch (error: any) {
    // If error is a JSON-RPC error, log brief info and passthrough
    if (error && typeof error === 'object' && 'code' in error && 'message' in error) {
      req.log.info({
        reqId: req.id,
        upstream: req.ctx?.upstream,
        rpcMethod: req.ctx?.rpcMethod ?? null,
        code: error.code,
        message: error.message,
        stage: 'forwardToolList',
      }, 'upstream.rpc_error');
      if (jsonRpcId !== undefined) {
        reply.status(500).send({ jsonrpc: '2.0', id: jsonRpcId, error });
      } else {
        reply.status(500).send({ error });
      }
      return;
    }
    // Otherwise, log full error
    req.log.error({
      reqId: req.id,
      upstream: req.ctx?.upstream,
      rpcMethod: req.ctx?.rpcMethod ?? null,
      err: error,
      stage: 'forwardToolList',
    }, 'upstream.error');
    const message = String(error);
    if (jsonRpcId !== undefined) {
      reply.status(500).send({ jsonrpc: '2.0', id: jsonRpcId, error: { code: -32000, message: 'listTools failed: ' + message } });
    } else {
      reply.status(500).send({ error: 'listTools failed', message });
    }
  } finally {
    if (req.ctx) req.ctx.timings.upstream = Number((performance.now() - tUp).toFixed(3));
  }
}

export async function forwardToolCall(req: FastifyRequest, reply: FastifyReply, up: Upstream, jsonRpcId?: string | number | null) {
  const tUp = performance.now();
  const body: any = req.body;
  const name = body?.name;
  const args = body?.arguments || {};
  if (!name) {
    if (jsonRpcId !== undefined) {
      return reply.status(400).send({ jsonrpc: '2.0', id: jsonRpcId, error: { code: -32602, message: 'Missing name' } });
    }
    return reply.status(400).send({ error: 'Missing name' });
  }
  try {
    const result = await up.client.callTool({ name, arguments: args });
    if (jsonRpcId !== undefined) {
      reply.send({ jsonrpc: '2.0', id: jsonRpcId, result });
    } else {
      reply.send(result);
    }
  } catch (error: any) {
    if (error && typeof error === 'object' && 'code' in error && 'message' in error) {
      req.log.info({
        reqId: req.id,
        upstream: req.ctx?.upstream,
        rpcMethod: req.ctx?.rpcMethod ?? null,
        code: error.code,
        message: error.message,
        stage: 'forwardToolCall',
      }, 'upstream.rpc_error');
      if (jsonRpcId !== undefined) {
        reply.status(500).send({ jsonrpc: '2.0', id: jsonRpcId, error });
      } else {
        reply.status(500).send({ error });
      }
      return;
    }
    req.log.error({
      reqId: req.id,
      upstream: req.ctx?.upstream,
      rpcMethod: req.ctx?.rpcMethod ?? null,
      err: error,
      stage: 'forwardToolCall',
    }, 'upstream.error');
    const message = String(error);
    if (jsonRpcId !== undefined) {
      reply.status(500).send({ jsonrpc: '2.0', id: jsonRpcId, error: { code: -32000, message: 'callTool failed: ' + message } });
    } else {
      reply.status(500).send({ error: 'callTool failed', message });
    }
  } finally {
    if (req.ctx) req.ctx.timings.upstream = Number((performance.now() - tUp).toFixed(3));
  }
}

export async function forwardPromptGet(req: FastifyRequest, reply: FastifyReply, up: Upstream, jsonRpcId?: string | number | null) {
  const tUp = performance.now();
  const body: any = req.body;
  const name = body?.name;
  const args = body?.arguments || {};
  if (!name) {
    if (jsonRpcId !== undefined) {
      return reply.status(400).send({ jsonrpc: '2.0', id: jsonRpcId, error: { code: -32602, message: 'Missing name' } });
    }
    return reply.status(400).send({ error: 'Missing name' });
  }
  try {
    const result = await up.client.getPrompt({ name, arguments: args });
    if (jsonRpcId !== undefined) {
      reply.send({ jsonrpc: '2.0', id: jsonRpcId, result });
    } else {
      reply.send(result);
    }
  } catch (error: any) {
    if (error && typeof error === 'object' && 'code' in error && 'message' in error) {
      req.log.info({
        reqId: req.id,
        upstream: req.ctx?.upstream,
        rpcMethod: req.ctx?.rpcMethod ?? null,
        code: error.code,
        message: error.message,
        stage: 'forwardPromptGet',
      }, 'upstream.rpc_error');
      if (jsonRpcId !== undefined) {
        reply.status(500).send({ jsonrpc: '2.0', id: jsonRpcId, error });
      } else {
        reply.status(500).send({ error });
      }
      return;
    }
    req.log.error({
      reqId: req.id,
      upstream: req.ctx?.upstream,
      rpcMethod: req.ctx?.rpcMethod ?? null,
      err: error,
      stage: 'forwardPromptGet',
    }, 'upstream.error');
    const message = String(error);
    if (jsonRpcId !== undefined) {
      reply.status(500).send({ jsonrpc: '2.0', id: jsonRpcId, error: { code: -32000, message: 'promptGet failed: ' + message } });
    } else {
      reply.status(500).send({ error: 'promptGet failed', message });
    }
  } finally {
    if (req.ctx) req.ctx.timings.upstream = Number((performance.now() - tUp).toFixed(3));
  }
}

export async function forwardPromptList(req: FastifyRequest, reply: FastifyReply, up: Upstream, jsonRpcId?: string | number | null) {
  const tUp = performance.now();
  try {
    const result = await up.client.listPrompts();
    if (jsonRpcId !== undefined) {
      reply.send({ jsonrpc: '2.0', id: jsonRpcId, result });
    } else {
      reply.send(result);
    }
  } catch (error: any) {
    if (error && typeof error === 'object' && 'code' in error && 'message' in error) {
      req.log.info({
        reqId: req.id,
        upstream: req.ctx?.upstream,
        rpcMethod: req.ctx?.rpcMethod ?? null,
        code: error.code,
        message: error.message,
        stage: 'forwardPromptList',
      }, 'upstream.rpc_error');
      if (jsonRpcId !== undefined) {
        reply.status(500).send({ jsonrpc: '2.0', id: jsonRpcId, error });
      } else {
        reply.status(500).send({ error });
      }
      return;
    }
    req.log.error({
      reqId: req.id,
      upstream: req.ctx?.upstream,
      rpcMethod: req.ctx?.rpcMethod ?? null,
      err: error,
      stage: 'forwardPromptList',
    }, 'upstream.error');
    const message = String(error);
    if (jsonRpcId !== undefined) {
      reply.status(500).send({ jsonrpc: '2.0', id: jsonRpcId, error: { code: -32000, message: 'listPrompts failed: ' + message } });
    } else {
      reply.status(500).send({ error: 'listPrompts failed', message });
    }
  } finally {
    if (req.ctx) req.ctx.timings.upstream = Number((performance.now() - tUp).toFixed(3));
  }
}

export async function forwardResourceList(req: FastifyRequest, reply: FastifyReply, up: Upstream, jsonRpcId?: string | number | null) {
  const tUp = performance.now();
  try {
    const result = await up.client.listResources();
    if (jsonRpcId !== undefined) {
      reply.send({ jsonrpc: '2.0', id: jsonRpcId, result });
    } else {
      reply.send(result);
    }
  } catch (error: any) {
    if (error && typeof error === 'object' && 'code' in error && 'message' in error) {
      req.log.info({
        reqId: req.id,
        upstream: req.ctx?.upstream,
        rpcMethod: req.ctx?.rpcMethod ?? null,
        code: error.code,
        message: error.message,
        stage: 'forwardResourceList',
      }, 'upstream.rpc_error');
      if (jsonRpcId !== undefined) {
        reply.status(500).send({ jsonrpc: '2.0', id: jsonRpcId, error });
      } else {
        reply.status(500).send({ error });
      }
      return;
    }
    req.log.error({
      reqId: req.id,
      upstream: req.ctx?.upstream,
      rpcMethod: req.ctx?.rpcMethod ?? null,
      err: error,
      stage: 'forwardResourceList',
    }, 'upstream.error');
    const message = String(error);
    if (jsonRpcId !== undefined) {
      reply.status(500).send({ jsonrpc: '2.0', id: jsonRpcId, error: { code: -32000, message: 'listResources failed: ' + message } });
    } else {
      reply.status(500).send({ error: 'listResources failed', message });
    }
  } finally {
    if (req.ctx) req.ctx.timings.upstream = Number((performance.now() - tUp).toFixed(3));
  }
}

export async function forwardResourceTemplateList(req: FastifyRequest, reply: FastifyReply, up: Upstream, jsonRpcId?: string | number | null) {
  const tUp = performance.now();
  try {
    const result = await up.client.listResourceTemplates();
    if (jsonRpcId !== undefined) {
      reply.send({ jsonrpc: '2.0', id: jsonRpcId, result });
    } else {
      reply.send(result);
    }
  } catch (error: any) {
    if (error && typeof error === 'object' && 'code' in error && 'message' in error) {
      req.log.info({
        reqId: req.id,
        upstream: req.ctx?.upstream,
        rpcMethod: req.ctx?.rpcMethod ?? null,
        code: error.code,
        message: error.message,
        stage: 'forwardResourceTemplateList',
      }, 'upstream.rpc_error');
      if (jsonRpcId !== undefined) {
        reply.status(500).send({ jsonrpc: '2.0', id: jsonRpcId, error });
      } else {
        reply.status(500).send({ error });
      }
      return;
    }
    req.log.error({
      reqId: req.id,
      upstream: req.ctx?.upstream,
      rpcMethod: req.ctx?.rpcMethod ?? null,
      err: error,
      stage: 'forwardResourceTemplateList',
    }, 'upstream.error');
    const message = String(error);
    if (jsonRpcId !== undefined) {
      reply.status(500).send({ jsonrpc: '2.0', id: jsonRpcId, error: { code: -32000, message: 'listResourceTemplates failed: ' + message } });
    } else {
      reply.status(500).send({ error: 'listResourceTemplates failed', message });
    }
  } finally {
    if (req.ctx) req.ctx.timings.upstream = Number((performance.now() - tUp).toFixed(3));
  }
}

export async function forwardResourceRead(req: FastifyRequest, reply: FastifyReply, up: Upstream, jsonRpcId?: string | number | null) {
  const tUp = performance.now();
  const body: any = req.body;
  const params = body?.params;
  if (!params) {
    if (jsonRpcId !== undefined) {
      return reply.status(400).send({ jsonrpc: '2.0', id: jsonRpcId, error: { code: -32602, message: 'Missing params' } });
    }
    return reply.status(400).send({ error: 'Missing params' });
  }
  try {
    const result = await up.client.readResource(params);
    if (jsonRpcId !== undefined) {
      reply.send({ jsonrpc: '2.0', id: jsonRpcId, result });
    } else {
      reply.send(result);
    }
  } catch (error: any) {
    if (error && typeof error === 'object' && 'code' in error && 'message' in error) {
      req.log.info({
        reqId: req.id,
        upstream: req.ctx?.upstream,
        rpcMethod: req.ctx?.rpcMethod ?? null,
        code: error.code,
        message: error.message,
        stage: 'forwardResourceRead',
      }, 'upstream.rpc_error');
      if (jsonRpcId !== undefined) {
        reply.status(500).send({ jsonrpc: '2.0', id: jsonRpcId, error });
      } else {
        reply.status(500).send({ error });
      }
      return;
    }
    req.log.error({
      reqId: req.id,
      upstream: req.ctx?.upstream,
      rpcMethod: req.ctx?.rpcMethod ?? null,
      err: error,
      stage: 'forwardResourceRead',
    }, 'upstream.error');
    const message = String(error);
    if (jsonRpcId !== undefined) {
      reply.status(500).send({ jsonrpc: '2.0', id: jsonRpcId, error: { code: -32000, message: 'readResource failed: ' + message } });
    } else {
      reply.status(500).send({ error: 'readResource failed', message });
    }
  } finally {
    if (req.ctx) req.ctx.timings.upstream = Number((performance.now() - tUp).toFixed(3));
  }
} 