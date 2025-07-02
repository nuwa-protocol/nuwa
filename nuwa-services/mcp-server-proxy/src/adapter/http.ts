/**
 * MCP Server Proxy - HTTP Adapter
 * Handles forwarding requests to httpStream upstreams
 */
import { FastifyRequest, FastifyReply } from 'fastify';
import { HttpStreamUpstream, AuthConfig } from '../types.js';
import { Client as MCPClient } from '@modelcontextprotocol/sdk/client/index.js';
import { StreamableHTTPClientTransport } from '@modelcontextprotocol/sdk/client/streamableHttp.js';

/**
 * Creates a FastMCP client for an HTTP upstream
 * @param baseURL The base URL of the upstream MCP server
 * @param auth Optional authentication configuration
 * @returns A configured FastMCP client
 */
export async function createHttpClient(baseURL: string, auth?: AuthConfig): Promise<MCPClient> {
  const headers: Record<string, string> = {};
  
  if (auth) {
    switch (auth.scheme) {
      case 'header':
        headers[auth.header] = auth.value;
        break;
      case 'basic':
        headers['Authorization'] = `Basic ${Buffer.from(`${auth.username}:${auth.password}`).toString('base64')}`;
        break;
      case 'bearer':
        headers['Authorization'] = `Bearer ${auth.token}`;
        break;
    }
  }
  
  const transport = new StreamableHTTPClientTransport(new URL(baseURL), {
    requestInit: { headers },
  } as any);

  const client = new MCPClient({ name: 'proxy-client', version: '0.1.0' }, {});
  await client.connect(transport);
  return client;
}

/**
 * Initializes HTTP upstreams
 * @param config The upstream configuration
 * @returns The initialized HTTP upstream
 */
export async function initHttpUpstream(
  name: string,
  config: { type: 'httpStream'; baseURL: string; auth?: AuthConfig }
): Promise<HttpStreamUpstream> {
  const client = await createHttpClient(config.baseURL, config.auth);
  
  return {
    type: 'httpStream',
    client,
    config,
  };
}

/**
 * Forwards a tool.call request to an HTTP upstream
 * @param request The Fastify request
 * @param reply The Fastify reply
 * @param upstream The HTTP upstream to forward to
 */
export async function forwardToolCall(
  request: FastifyRequest,
  reply: FastifyReply,
  upstream: HttpStreamUpstream
) {
  const { client } = upstream;
  const body = request.body as any;
  
  try {
    // Set appropriate headers for streaming response
    reply.raw.writeHead(200, {
      'Content-Type': 'text/event-stream',
      'Cache-Control': 'no-cache',
      'Connection': 'keep-alive',
    });
    
    // Forward the tool call to the upstream
    const stream = await client.callTool({ name: body.name, arguments: body.arguments || {} });
    
    // Pipe the stream to the response
    for await (const chunk of stream) {
      // Send each chunk as an SSE event
      reply.raw.write(`data: ${JSON.stringify(chunk)}\n\n`);
    }
    
    // End the response
    reply.raw.end();
  } catch (error) {
    console.error('Error forwarding tool call:', error);
    
    // If headers haven't been sent yet, send an error response
    if (!reply.sent) {
      reply.status(500).send({
        error: 'Failed to forward request to upstream',
        message: error instanceof Error ? error.message : String(error),
      });
    } else {
      // If headers have been sent, we need to end the stream with an error event
      reply.raw.write(`event: error\ndata: ${JSON.stringify({
        error: 'Upstream error',
        message: error instanceof Error ? error.message : String(error),
      })}\n\n`);
      reply.raw.end();
    }
  }
}

/**
 * Forwards a tool.list request to an HTTP upstream
 * @param request The Fastify request
 * @param reply The Fastify reply
 * @param upstream The HTTP upstream to forward to
 */
export async function forwardToolList(
  request: FastifyRequest,
  reply: FastifyReply,
  upstream: HttpStreamUpstream
) {
  const { client } = upstream;
  
  try {
    const tools = await client.listTools();
    reply.send(tools);
  } catch (error) {
    console.error('Error forwarding tool list request:', error);
    reply.status(500).send({
      error: 'Failed to forward request to upstream',
      message: error instanceof Error ? error.message : String(error),
    });
  }
}

/**
 * Forwards a prompt.load request to an HTTP upstream
 * @param request The Fastify request
 * @param reply The Fastify reply
 * @param upstream The HTTP upstream to forward to
 */
export async function forwardPromptLoad(
  request: FastifyRequest,
  reply: FastifyReply,
  upstream: HttpStreamUpstream
) {
  const { client } = upstream;
  const body = request.body as any;
  
  try {
    // Set appropriate headers for streaming response
    reply.raw.writeHead(200, {
      'Content-Type': 'text/event-stream',
      'Cache-Control': 'no-cache',
      'Connection': 'keep-alive',
    });
    
    // Forward the prompt load to the upstream
    const stream = await client.loadPrompt({ name: body.name, arguments: body.arguments || {} });
    
    // Pipe the stream to the response
    for await (const chunk of stream) {
      // Send each chunk as an SSE event
      reply.raw.write(`data: ${JSON.stringify(chunk)}\n\n`);
    }
    
    // End the response
    reply.raw.end();
  } catch (error) {
    console.error('Error forwarding prompt load request:', error);
    
    // If headers haven't been sent yet, send an error response
    if (!reply.sent) {
      reply.status(500).send({
        error: 'Failed to forward request to upstream',
        message: error instanceof Error ? error.message : String(error),
      });
    } else {
      // If headers have been sent, we need to end the stream with an error event
      reply.raw.write(`event: error\ndata: ${JSON.stringify({
        error: 'Upstream error',
        message: error instanceof Error ? error.message : String(error),
      })}\n\n`);
      reply.raw.end();
    }
  }
} 