import { StreamableHTTPClientTransport } from '@modelcontextprotocol/sdk/client/streamableHttp.js';
import { StdioClientTransport } from '@modelcontextprotocol/sdk/client/stdio.js';
import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { ServerCapabilities } from '@modelcontextprotocol/sdk/types.js';
import { UpstreamConfig, AuthConfig, Upstream} from './types.js';

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
  if (cfg.type === 'httpStream') {
    transport = new StreamableHTTPClientTransport(new URL(cfg.baseURL), {
      requestInit: { headers: buildHeaders(cfg.auth) },
    } as any);
  } else {
    transport = new StdioClientTransport({
      command: cfg.command[0],
      args: cfg.command.slice(1),
      cwd: cfg.cwd,
      env: cfg.env,
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
export async function forwardToolList(_req: FastifyRequest, reply: FastifyReply, up: Upstream, jsonRpcId?: string | number | null) {
  try {
    const result = await up.client.listTools();
    if (jsonRpcId !== undefined) {
      reply.send({ jsonrpc: '2.0', id: jsonRpcId, result });
    } else {
      reply.send(result);
    }
  } catch (error) {
    const message = String(error);
    if (jsonRpcId !== undefined) {
      reply.status(500).send({ jsonrpc: '2.0', id: jsonRpcId, error: { code: -32000, message: 'listTools failed: ' + message } });
    } else {
      reply.status(500).send({ error: 'listTools failed', message });
    }
  }
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
  try {
    const result = await up.client.callTool({ name, arguments: args });
    if (jsonRpcId !== undefined) {
      reply.send({ jsonrpc: '2.0', id: jsonRpcId, result });
    } else {
      reply.send(result);
    }
  } catch (e: any) {
    const message = String(e);
    if (jsonRpcId !== undefined) {
      reply.status(500).send({ jsonrpc: '2.0', id: jsonRpcId, error: { code: -32000, message: 'callTool failed: ' + message } });
    } else {
      reply.status(500).send({ error: 'callTool failed', message });
    }
  }
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
  try {
    const result = await up.client.getPrompt({ name, arguments: args });
    if (jsonRpcId !== undefined) {
      reply.send({ jsonrpc: '2.0', id: jsonRpcId, result });
    } else {
      reply.send(result);
    }
  } catch (e: any) {
    const message = String(e);
    if (jsonRpcId !== undefined) {
      reply.status(500).send({ jsonrpc: '2.0', id: jsonRpcId, error: { code: -32000, message: 'promptGet failed: ' + message } });
    } else {
      reply.status(500).send({ error: 'prompt.load failed', message });
    }
  }
}

export async function forwardPromptList(_req: FastifyRequest, reply: FastifyReply, up: Upstream, jsonRpcId?: string | number | null) {
  try {
    const result = await up.client.listPrompts();
    if (jsonRpcId !== undefined) {
      reply.send({ jsonrpc: '2.0', id: jsonRpcId, result });
    } else {
      reply.send(result);
    }
  } catch (error) {
    const message = String(error);
    if (jsonRpcId !== undefined) {
      reply.status(500).send({ jsonrpc: '2.0', id: jsonRpcId, error: { code: -32000, message: 'listPrompts failed: ' + message } });
    } else {
      reply.status(500).send({ error: 'listPrompts failed', message });
    }
  }
}

export async function forwardResourceList(_req: FastifyRequest, reply: FastifyReply, up: Upstream, jsonRpcId?: string | number | null) {
  try {
    const result = await up.client.listResources();
    if (jsonRpcId !== undefined) {
      reply.send({ jsonrpc: '2.0', id: jsonRpcId, result });
    } else {
      reply.send(result);
    }
  } catch (error) {
    const message = String(error);
    if (jsonRpcId !== undefined) {
      reply.status(500).send({ jsonrpc: '2.0', id: jsonRpcId, error: { code: -32000, message: 'listResources failed: ' + message } });
    } else {
      reply.status(500).send({ error: 'listResources failed', message });
    }
  }
}

export async function forwardResourceTemplateList(_req: FastifyRequest, reply: FastifyReply, up: Upstream, jsonRpcId?: string | number | null) {
  try {
    const result = await up.client.listResourceTemplates();
    if (jsonRpcId !== undefined) {
      reply.send({ jsonrpc: '2.0', id: jsonRpcId, result });
    } else {
      reply.send(result);
    }
  } catch (error) {
    const message = String(error);
    if (jsonRpcId !== undefined) {
      reply.status(500).send({ jsonrpc: '2.0', id: jsonRpcId, error: { code: -32000, message: 'listResourceTemplates failed: ' + message } });
    } else {
      reply.status(500).send({ error: 'listResourceTemplates failed', message });
    }
  }
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
  try {
    const result = await up.client.readResource(params);
    if (jsonRpcId !== undefined) {
      reply.send({ jsonrpc: '2.0', id: jsonRpcId, result });
    } else {
      reply.send(result);
    }
  } catch (error) {
    const message = String(error);
    if (jsonRpcId !== undefined) {
      reply.status(500).send({ jsonrpc: '2.0', id: jsonRpcId, error: { code: -32000, message: 'readResource failed: ' + message } });
    } else {
      reply.status(500).send({ error: 'readResource failed', message });
    }
  }
} 