import { StreamableHTTPClientTransport } from '@modelcontextprotocol/sdk/client/streamableHttp.js';
import { StdioClientTransport } from '@modelcontextprotocol/sdk/client/stdio.js';
// eslint-disable-next-line @typescript-eslint/consistent-type-imports
import type { Client as MCPClient } from '@modelcontextprotocol/sdk/client/index.js';
import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { UpstreamConfig, AuthConfig, Upstream } from './types.js';

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
  await client.initialize();

  return { type: cfg.type, client, config: cfg };
}

// ---------- forwarding helpers (used by server.ts) -----------------
import type { FastifyRequest, FastifyReply } from 'fastify';

export async function forwardToolList(_req: FastifyRequest, reply: FastifyReply, up: Upstream) {
  try {
    const res = await up.client.listTools();
    reply.send(res);
  } catch (error) {
    reply.status(500).send({ error: 'listTools failed', message: String(error) });
  }
}

export async function forwardToolCall(req: FastifyRequest, reply: FastifyReply, up: Upstream) {
  const body: any = req.body;
  const name = body?.name;
  const args = body?.arguments || {};
  if (!name) return reply.status(400).send({ error: 'Missing name' });
  try {
    const result = await up.client.request({ method: 'tools/call', params: { name, arguments: args } }, {} as any);
    reply.send(result);
  } catch (e) {
    reply.status(500).send({ error: 'callTool failed', message: String(e) });
  }
}

export async function forwardPromptLoad(req: FastifyRequest, reply: FastifyReply, up: Upstream) {
  const body: any = req.body;
  const name = body?.name;
  const args = body?.arguments || {};
  if (!name) return reply.status(400).send({ error: 'Missing name' });
  try {
    const result = await up.client.request({ method: 'prompts/get', params: { name, arguments: args } }, {} as any);
    reply.send(result);
  } catch (e) {
    reply.status(500).send({ error: 'prompt.load failed', message: String(e) });
  }
} 