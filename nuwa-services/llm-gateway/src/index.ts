import * as dotenv from "dotenv";
// Load default .env (project root) first
dotenv.config();
// Then optionally override with .env.local if present (not required)
dotenv.config({ path: ".env.local", override: true });

// ------ DIDAuth & VDR setup ------
import {
  VDRRegistry,
  initRoochVDR,
  InMemoryLRUDIDDocumentCache,
} from "@nuwa-ai/identity-kit";

// Prepare global VDR registry with Rooch method and LRU cache
const registry = VDRRegistry.getInstance();
registry.setCache(new InMemoryLRUDIDDocumentCache(2000));
initRoochVDR("test", undefined, registry);

import express, { Request, Response } from "express";
import cors from "cors";
import { initPaymentKitAndRegisterRoutes } from './paymentKit.js';
import { accessLogMiddleware } from './middleware/accessLog.js';

const app = express();

async function start() {
  try {
    app.use(
      cors({
        origin: true, 
        credentials: true,
      })
    );

    app.use(express.json({ limit: "50mb" }));
    app.use(express.urlencoded({ extended: true }));

    // Access Log middleware (must be before PaymentKit routes)
    app.use(accessLogMiddleware);

    // enable payment kit
    await initPaymentKitAndRegisterRoutes(app);

    app.get("/", (req: Request, res: Response) => {
      res.json({
        service: "Nuwa LLM Gateway",
        version: "1.0.0",
        status: "running",
        timestamp: new Date().toISOString(),
      });
    });

    const port = parseInt(process.env.PORT || "3000");
    const host = process.env.HOST || "0.0.0.0";

    const server = app.listen(port, host, () => {
      console.log(`🚀 LLM Gateway server is running on http://${host}:${port}`);
    });

    
    const gracefulShutdown = async (signal: string) => {
      console.log(`\n🛑 Received ${signal}, shutting down gracefully...`);
      server.close((err?: Error) => {
        if (err) {
          console.error("❌ Error during shutdown:", err);
          process.exit(1);
        } else {
          console.log("✅ Server closed successfully");
          process.exit(0);
        }
      });
    };

    process.on("SIGINT", () => gracefulShutdown("SIGINT"));
    process.on("SIGTERM", () => gracefulShutdown("SIGTERM"));
  } catch (error) {
    console.error("❌ Error starting server:", error);
    process.exit(1);
  }
}

start();
