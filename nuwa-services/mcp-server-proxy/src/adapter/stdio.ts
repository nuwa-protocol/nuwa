/**
 * MCP Server Proxy - stdio Adapter
 * Handles forwarding requests to stdio-based upstreams
 */
import { FastifyRequest, FastifyReply } from 'fastify';
import { spawn, ChildProcess } from 'child_process';
import { StdioUpstream, StdioUpstreamConfig } from '../types.js';

/**
 * Initializes a stdio upstream
 * @param config The upstream configuration
 * @returns The initialized stdio upstream
 */
export function initStdioUpstream(
  name: string,
  config: StdioUpstreamConfig
): StdioUpstream {
  const { command, cwd, env } = config;
  
  // Spawn the child process (avoid naming conflict with global 'process')
  const child = spawn(command[0], command.slice(1), {
    cwd: cwd || process.cwd(),
    env: {
      ...process.env,
      ...env,
    },
    stdio: ['pipe', 'pipe', 'pipe'],
  });
  
  // Log process events
  child.on('error', (error) => {
    console.error(`[${name}] Process error:`, error);
  });
  
  child.stderr.on('data', (data) => {
    console.error(`[${name}] stderr:`, data.toString());
  });
  
  child.on('exit', (code, signal) => {
    console.log(`[${name}] Process exited with code ${code} and signal ${signal}`);
  });
  
  return {
    type: 'stdio',
    process: child,
    config,
  };
}

/**
 * Forwards a tool.call request to a stdio upstream
 * @param request The Fastify request
 * @param reply The Fastify reply
 * @param upstream The stdio upstream to forward to
 */
export async function forwardToolCall(
  request: FastifyRequest,
  reply: FastifyReply,
  upstream: StdioUpstream
) {
  const { process: child } = upstream;
  const body = request.body as any;
  
  try {
    // Set appropriate headers for streaming response
    reply.raw.writeHead(200, {
      'Content-Type': 'text/event-stream',
      'Cache-Control': 'no-cache',
      'Connection': 'keep-alive',
    });
    
    // Create a promise to handle the response
    const responsePromise = new Promise<void>((resolve, reject) => {
      // Set up data handler for stdout
      child.stdout.on('data', (data) => {
        try {
          // Parse the JSON response from the stdio process
          const responseText = data.toString();
          const lines = responseText.split('\n').filter(line => line.trim());
          
          for (const line of lines) {
            try {
              // Try to parse as JSON
              const jsonData = JSON.parse(line);
              // Send as SSE event
              reply.raw.write(`data: ${line}\n\n`);
            } catch (e) {
              // If not valid JSON, send as plain text
              reply.raw.write(`data: ${JSON.stringify({ text: line })}\n\n`);
            }
          }
        } catch (error) {
          console.error('Error processing stdio output:', error);
        }
      });
      
      // Set up error handler
      child.stderr.once('data', (data) => {
        const errorMsg = data.toString();
        console.error('Stdio process error:', errorMsg);
        reply.raw.write(`event: error\ndata: ${JSON.stringify({
          error: 'Upstream error',
          message: errorMsg,
        })}\n\n`);
        reject(new Error(errorMsg));
      });
      
      // Set up end handler
      child.stdout.once('end', () => {
        reply.raw.end();
        resolve();
      });
      
      // Set up close handler
      child.once('close', (code) => {
        if (code !== 0) {
          reply.raw.write(`event: error\ndata: ${JSON.stringify({
            error: 'Upstream process closed',
            code,
          })}\n\n`);
          reject(new Error(`Process exited with code ${code}`));
        } else {
          resolve();
        }
      });
    });
    
    // Send the request to the stdio process
    const requestPayload = {
      jsonrpc: '2.0',
      id: Date.now(),
      method: 'tools/call',
      params: { name: body.name, arguments: body.arguments || {} },
    };
    
    child.stdin.write(JSON.stringify(requestPayload) + '\n');
    
    // Wait for the response to complete
    await responsePromise;
  } catch (error) {
    console.error('Error forwarding tool call to stdio process:', error);
    
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
 * Forwards a tool.list request to a stdio upstream
 * @param request The Fastify request
 * @param reply The Fastify reply
 * @param upstream The stdio upstream to forward to
 */
export async function forwardToolList(
  request: FastifyRequest,
  reply: FastifyReply,
  upstream: StdioUpstream
): Promise<void> {
  const { process: child } = upstream;
  
  return new Promise<void>((resolve, reject) => {
    try {
      let responseData = '';
      
      // Set up data handler for stdout
      const dataHandler = (data: Buffer) => {
        responseData += data.toString();
        console.log('responseData', responseData);
      };
      
      // Set up end handler
      const endHandler = () => {
        try {
          // Parse the JSON response
          const tools = JSON.parse(responseData);
          reply.send(tools);
          resolve();
        } catch (error) {
          console.error('Error parsing tool list response:', error);
          reply.status(500).send({
            error: 'Failed to parse tool list response',
            message: error instanceof Error ? error.message : String(error),
          });
          reject(error);
        }
      };
      
      // Set up error handler
      const errorHandler = (data: Buffer) => {
        const errorMsg = data.toString();
        console.error('Stdio process error during tool list:', errorMsg);
        reply.status(500).send({
          error: 'Upstream error',
          message: errorMsg,
        });
        reject(new Error(errorMsg));
      };
      
      // Add event listeners
      child.stdout.on('data', dataHandler);
      child.stdout.once('end', endHandler);
      child.stderr.once('data', errorHandler);
      
      // Clean up event listeners when done
      const cleanup = () => {
        child.stdout.removeListener('data', dataHandler);
        child.stdout.removeListener('end', endHandler);
        child.stderr.removeListener('data', errorHandler);
      };
      
      // Send the request to the stdio process
      const requestPayload = {
        jsonrpc: '2.0',
        id: Date.now(),
        method: 'tools/list',
        params: {},
      };
      console.log('requestPayload', requestPayload);
      child.stdin.write(JSON.stringify(requestPayload) + '\n');
      
      // Set a timeout to prevent hanging
    //   const timeoutId = setTimeout(() => {
    //     cleanup();
    //     reply.status(504).send({
    //       error: 'Upstream timeout',
    //       message: 'Timed out waiting for tool list response',
    //     });
    //     reject(new Error('Timeout waiting for tool list response'));
    //   }, 10000);
      
      // Clear timeout when done
      child.stdout.once('end', () => {
        //clearTimeout(timeoutId);
        cleanup();
      });
    } catch (error) {
      console.error('Error forwarding tool list request to stdio process:', error);
      reply.status(500).send({
        error: 'Failed to forward request to upstream',
        message: error instanceof Error ? error.message : String(error),
      });
      reject(error);
    }
  });
} 