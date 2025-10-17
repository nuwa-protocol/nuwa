import * as dotenv from "dotenv";
import express, { Request, Response } from "express";
import cors from "cors";
import {
  VDRRegistry,
  initRoochVDR,
  InMemoryLRUDIDDocumentCache,
} from "@nuwa-ai/identity-kit";
import { initPaymentKitAndRegisterRoutes } from './gateway.js';
import { accessLogMiddleware } from './middleware/accessLog.js';
import type { LLMGatewayConfig } from './config/cli.js';

/**
 * Server instance interface
 */
export interface ServerInstance {
  app: express.Application;
  server: any;
  close: () => Promise<void>;
}

/**
 * Initialize VDR registry with Rooch support
 */
function initializeVDR(network: string = 'test', rpcUrl?: string): void {
  const registry = VDRRegistry.getInstance();
  registry.setCache(new InMemoryLRUDIDDocumentCache(2000));
  
  // Initialize Rooch VDR with network and optional RPC URL
  initRoochVDR(network as any, rpcUrl, registry);
  
  console.log(`🔐 VDR initialized with Rooch network: ${network}${rpcUrl ? ` (${rpcUrl})` : ''}`);
}

/**
 * Create and configure Express application
 */
function createApp(config: LLMGatewayConfig): express.Application {
  const app = express();
  
  // CORS configuration
  app.use(
    cors({
      origin: true, 
      credentials: true,
    })
  );

  // Body parsing middleware
  app.use(express.json({ limit: "50mb" }));
  app.use(express.urlencoded({ extended: true }));

  // Access Log middleware (must be before PaymentKit routes)
  app.use(accessLogMiddleware);

  // Health check endpoint
  app.get("/", (req: Request, res: Response) => {
    res.json({
      service: "Nuwa LLM Gateway",
      version: "1.0.0",
      status: "running",
      timestamp: new Date().toISOString(),
      config: {
        network: config.network,
        serviceId: config.serviceId,
        debug: config.debug,
      },
    });
  });

  return app;
}

/**
 * Start the LLM Gateway server
 */
export async function startServer(
  configOverride?: Partial<LLMGatewayConfig>
): Promise<ServerInstance> {
  try {
    console.log('🔧 Loading environment variables...');
    // Load environment variables
    dotenv.config();
    dotenv.config({ path: ".env.local", override: true });
    
    // Default configuration
    const defaultConfig: LLMGatewayConfig = {
      port: parseInt(process.env.PORT || "8080"),
      host: process.env.HOST || "0.0.0.0",
      network: process.env.ROOCH_NETWORK as any || "test",
      rpcUrl: process.env.ROOCH_NODE_URL,
      serviceId: process.env.SERVICE_ID || "llm-gateway",
      serviceKey: process.env.SERVICE_KEY,
      defaultAssetId: process.env.DEFAULT_ASSET_ID || "0x3::gas_coin::RGas",
      defaultPricePicoUSD: process.env.DEFAULT_PRICE_PICO_USD || "0",
      debug: process.env.DEBUG === 'true',
      adminDid: process.env.ADMIN_DID?.split(',').map(did => did.trim()),
      openaiApiKey: process.env.OPENAI_API_KEY,
      openaiBaseUrl: process.env.OPENAI_BASE_URL,
      openrouterApiKey: process.env.OPENROUTER_API_KEY,
      openrouterBaseUrl: process.env.OPENROUTER_BASE_URL,
      litellmApiKey: process.env.LITELLM_API_KEY,
      litellmBaseUrl: process.env.LITELLM_BASE_URL,
      pricingOverrides: process.env.PRICING_OVERRIDES,
      openaiPricingVersion: process.env.OPENAI_PRICING_VERSION,
      httpReferer: process.env.HTTP_REFERER,
      xTitle: process.env.X_TITLE,
    };

    // Merge with override configuration
    const config = { ...defaultConfig, ...configOverride };
    
    console.log('🔐 Initializing VDR registry...');
    // Initialize VDR registry
    initializeVDR(config.network, config.rpcUrl);
    
    console.log('🌐 Creating Express application...');
    // Create Express app
    const app = createApp(config);
    
    console.log('💳 Initializing PaymentKit and registering routes...');
    // Initialize PaymentKit and register routes
    await initPaymentKitAndRegisterRoutes(app);
    
    console.log(`🚀 Starting LLM Gateway server...`);
    console.log(`📍 Host: ${config.host}`);
    console.log(`🔌 Port: ${config.port}`);
    console.log(`🌐 Network: ${config.network}`);
    console.log(`🔧 Service ID: ${config.serviceId}`);
    console.log(`🐛 Debug: ${config.debug ? 'enabled' : 'disabled'}`);
    
    // Check provider configuration
    const providers = [];
    if (config.openaiApiKey) providers.push('OpenAI');
    if (config.openrouterApiKey) providers.push('OpenRouter');
    if (config.litellmApiKey) providers.push('LiteLLM');
    
    if (providers.length > 0) {
      console.log(`🤖 Configured providers: ${providers.join(', ')}`);
    } else {
      console.warn('⚠️  No provider API keys configured. Please set at least one provider API key.');
    }

    return new Promise((resolve, reject) => {
      const server = app.listen(config.port, config.host, () => {
        console.log(`✅ LLM Gateway server is running on http://${config.host}:${config.port}`);
        
        const serverInstance: ServerInstance = {
          app,
          server,
          close: () => {
            return new Promise((closeResolve, closeReject) => {
              console.log('🛑 Shutting down server...');
              server.close((err?: Error) => {
                if (err) {
                  console.error("❌ Error during shutdown:", err);
                  closeReject(err);
                } else {
                  console.log("✅ Server closed successfully");
                  closeResolve();
                }
              });
            });
          }
        };
        
        resolve(serverInstance);
      });
      
      server.on('error', (err: Error) => {
        console.error("❌ Server error:", err);
        reject(err);
      });
    });
    
  } catch (error) {
    console.error("❌ Error starting server:", error);
    throw error;
  }
}

/**
 * Main function for direct execution
 */
export async function main() {
  try {
    const serverInstance = await startServer();

    const shutdown = async () => {
      try {
        await serverInstance.close();
        process.exit(0);
      } catch (error) {
        console.error("❌ Error during shutdown:", error);
        process.exit(1);
      }
    };

    process.on("SIGINT", shutdown);
    process.on("SIGTERM", shutdown);
    
  } catch (error) {
    console.error("❌ Failed to start server:", error);
    process.exit(1);
  }
}

// If this file is run directly, start the server
if (import.meta.url === `file://${process.argv[1]}`) {
  main();
}
