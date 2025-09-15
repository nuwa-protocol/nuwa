/**
 * MCP Gateway Server - Routes requests to MCP instances based on subdomain
 */
import Fastify from "fastify";
import cors from "@fastify/cors";
import httpProxy from "@fastify/http-proxy";
import { loadConfig } from "./config.js";
import { GatewayRouter } from "./router.js";
import { HealthChecker } from "./health.js";
import type { GatewayConfig } from "./types.js";

// Exported function to start the server (for testing and direct use)
async function startServer(
  configOverride?: Partial<GatewayConfig>,
): Promise<{ close: () => Promise<void>; server: any }> {
  const config = configOverride ? { ...loadConfig(), ...configOverride } : loadConfig();

  // Create Fastify instance
  const fastify = Fastify({
    logger: config.debug ? {
      level: 'debug',
      transport: {
        target: 'pino-pretty',
        options: {
          colorize: true,
        },
      },
    } : false,
  });

  // Register CORS
  await fastify.register(cors, config.cors);

  // Initialize router and health checker
  const router = new GatewayRouter(config);
  const healthChecker = new HealthChecker(config);

  // Start health checks
  healthChecker.start(config.instances);

  // Gateway status endpoint
  fastify.get('/gateway/status', async (request: any, reply: any) => {
    const healthSummary = healthChecker.getHealthSummary();
    const instances = router.getInstances();
    
    return {
      gateway: {
        version: '0.1.0',
        baseDomain: config.baseDomain,
        instanceCount: instances.length,
      },
      health: healthSummary,
      instances: instances.map(instance => ({
        name: instance.name,
        subdomain: instance.subdomain,
        targetUrl: instance.targetUrl,
        enabled: instance.enabled,
        description: instance.description,
        health: healthChecker.getInstanceHealth(instance.name),
      })),
    };
  });

  // Health check endpoint for individual instances
  fastify.get('/gateway/health/:instance', async (request: any, reply: any) => {
    const { instance } = request.params as { instance: string };
    const health = healthChecker.getInstanceHealth(instance);
    
    if (!health) {
      reply.code(404);
      return { error: `Instance '${instance}' not found` };
    }
    
    return health;
  });

  // Gateway health endpoint
  fastify.get('/gateway/health', async (request: any, reply: any) => {
    const healthStatuses = healthChecker.getHealthStatus();
    const summary = healthChecker.getHealthSummary();
    
    // Gateway is healthy if at least one instance is healthy
    const isHealthy = summary.healthy > 0;
    
    if (!isHealthy) {
      reply.code(503);
    }
    
    return {
      status: isHealthy ? 'healthy' : 'unhealthy',
      summary,
      instances: healthStatuses,
    };
  });

  // Instance discovery endpoint
  fastify.get('/gateway/instances', async (request: any, reply: any) => {
    const instances = router.getInstances();
    return {
      baseDomain: config.baseDomain,
      instances: instances.map(instance => ({
        name: instance.name,
        subdomain: instance.subdomain,
        url: `https://${instance.subdomain}.${config.baseDomain}`,
        targetUrl: instance.targetUrl,
        description: instance.description,
        enabled: instance.enabled,
      })),
    };
  });

  // Main proxy handler - catch all other requests
  fastify.all('/*', async (request: any, reply: any) => {
    const routeResult = router.routeRequest(request);
    
    if (routeResult.error) {
      if (config.debug) {
        console.log(`[Gateway] Routing error: ${routeResult.error}`);
      }
      reply.code(404);
      return { 
        error: routeResult.error,
        gateway: 'MCP Gateway',
        availableSubdomains: router.getInstances().map(i => i.subdomain),
      };
    }

    if (!routeResult.targetUrl) {
      reply.code(500);
      return { error: 'No target URL resolved' };
    }

    // Check if instance is healthy (optional - can be disabled for better availability)
    if (routeResult.instance && !healthChecker.isInstanceHealthy(routeResult.instance.name)) {
      if (config.debug) {
        console.log(`[Gateway] Instance ${routeResult.instance.name} is unhealthy, but forwarding anyway`);
      }
      // Note: We still forward to unhealthy instances to let them handle the request
      // The client will get the actual error from the instance
    }

    if (config.debug) {
      console.log(`[Gateway] Proxying ${request.method} ${request.url} to ${routeResult.targetUrl}`);
    }

    // Proxy the request
    try {
      // Use undici fetch for proxying
      const targetUrl = new URL(request.url, routeResult.targetUrl);
      
      const response = await fetch(targetUrl.toString(), {
        method: request.method,
        headers: {
          ...request.headers,
          // Remove host header to avoid conflicts
          host: undefined,
          // Add forwarded headers
          'x-forwarded-for': request.ip,
          'x-forwarded-proto': request.protocol,
          'x-forwarded-host': request.headers.host || '',
        },
        body: request.method !== 'GET' && request.method !== 'HEAD' 
          ? JSON.stringify(request.body) 
          : undefined,
      });

      // Copy response headers
      for (const [key, value] of response.headers.entries()) {
        reply.header(key, value);
      }

      reply.code(response.status);
      
      // Handle different response types
      const contentType = response.headers.get('content-type') || '';
      
      if (contentType.includes('text/event-stream')) {
        // Handle SSE streams
        reply.raw.writeHead(response.status, Object.fromEntries(response.headers.entries()));
        
        if (response.body) {
          const reader = response.body.getReader();
          try {
            while (true) {
              const { done, value } = await reader.read();
              if (done) break;
              reply.raw.write(value);
            }
          } finally {
            reader.releaseLock();
          }
        }
        reply.raw.end();
        return;
      } else if (contentType.includes('application/json')) {
        // Handle JSON responses
        return await response.json();
      } else {
        // Handle other responses as text
        return await response.text();
      }
    } catch (error) {
      console.error(`[Gateway] Proxy error:`, error);
      reply.code(502);
      return { 
        error: 'Bad Gateway', 
        message: 'Failed to proxy request to upstream server',
        target: routeResult.targetUrl,
      };
    }
  });

  // Start server
  const address = await fastify.listen({
    port: config.port,
    host: '0.0.0.0',
  });

  console.log(`🌐 MCP Gateway started on ${address}`);
  console.log(`📋 Base domain: ${config.baseDomain}`);
  console.log(`🔧 Configured instances: ${config.instances.length}`);
  
  if (config.debug) {
    console.log(`📊 Gateway status: ${address}/gateway/status`);
    console.log(`🏥 Gateway health: ${address}/gateway/health`);
    console.log(`📋 Instance list: ${address}/gateway/instances`);
  }

  return {
    server: fastify,
    close: async () => {
      try {
        healthChecker.stop();
        await fastify.close();
      } catch (e) {
        console.error("Error during server shutdown:", e);
      }
    },
  };
}

// Main function for direct execution
async function main() {
  try {
    const serverInstance = await startServer();

    const shutdown = async () => {
      try {
        await serverInstance.close();
      } catch (e) {
        console.error("Error during shutdown:", e);
        process.exit(1);
      }
      process.exit(0);
    };

    process.once("SIGINT", shutdown);
    process.once("SIGTERM", shutdown);
  } catch (error) {
    console.error("Failed to start gateway server:", error);
    process.exit(1);
  }
}

// Run the server if this file is executed directly
if (import.meta.url === `file://${process.argv[1]}`) {
  main().catch(console.error);
}

// For testing/importing
export { loadConfig, startServer };
