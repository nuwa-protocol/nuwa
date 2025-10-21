import { IdentityKit, KeyManager } from "@nuwa-ai/identity-kit";
import {IPFS_NODE, IPFS_NODE_PORT, IPFS_NODE_URL, TARGET} from "../constant.js";
import { config } from "dotenv";
import { create } from 'ipfs-http-client';
import { uploadCapTool } from "./upload-cap.js";
import { downloadCapTool } from "./download-cap.js";
import { favoriteCapTool } from "./favorite-cap.js";
import { queryCapByIDTool } from "./query-cap-by-id.js";
import { queryCapByNameTool } from "./query-cap-by-name.js";
import { queryCapStatsTool } from "./query-cap-stas.js";
import { queryMyFavoriteCapTool } from "./query-my-favorite-cap.js";
import { rateCapTool } from "./rate-cap.js";
import { updateEnableCapTool } from "./update-enable-cap.js";
import { queryCapRatingDistributionTool } from "./query-cap-rating-distribution.js";
import { createFastMcpServerFromEnv } from "@nuwa-ai/payment-kit";

// Load environment variables
config();

// -----------------------------------------------------------------------------
// IPFS Client Initialization
// -----------------------------------------------------------------------------
export let ipfsClient: any;

(async () => {
  try {

    if (IPFS_NODE_URL) {
      ipfsClient = create({
        url: IPFS_NODE_URL
      });
    } else {
      // Create IPFS HTTP client
      ipfsClient = create({
        host: IPFS_NODE,
        port: parseInt(IPFS_NODE_PORT),
        protocol: 'http'
      });

      // Verify connection
      const nodeId = await ipfsClient.id();
      console.log('✅ IPFS client initialized');
      console.log(`🌐 Connected to go-ipfs node: ${nodeId.id}`);
    }
  } catch (error) {
    console.error('❌ Failed to initialize IPFS client:', error);
    process.exit(1);
  }
})();

// Initialize MCP server using payment-kit (with FREE tools only)
let _mcpInstance: Awaited<ReturnType<typeof createFastMcpServerFromEnv>> | null = null;

export async function getService() {
  if (!_mcpInstance) {
    // Initialize service key and identity environment
    const serviceKey = process.env.SERVICE_KEY;
    if (!serviceKey) {
      throw new Error("SERVICE_KEY environment variable is required");
    }
    
    const keyManager = await KeyManager.fromSerializedKey(serviceKey);
    const serviceDid = await keyManager.getDid();
    console.log('🔑 Service DID:', serviceDid);

    const env = await IdentityKit.bootstrap({
      method: "rooch",
      keyStore: keyManager.getStore(),
      vdrOptions: {
        network: TARGET === 'local' ? 'local' : 'test',
      },
    });

    _mcpInstance = await createFastMcpServerFromEnv(env, {
      serviceId: "nuwa-capstore-indexer",
      adminDid: serviceDid,
      debug: process.env.DEBUG === "true",
      port: parseInt(process.env.PORT || "3000"),
      endpoint: "/mcp",
    });

    // Register FREE tools
    _mcpInstance.freeTool(downloadCapTool);
    _mcpInstance.freeTool(queryCapByIDTool);
    _mcpInstance.freeTool(queryCapByNameTool);
    _mcpInstance.freeTool(queryCapStatsTool);
    _mcpInstance.freeTool(queryMyFavoriteCapTool);
    _mcpInstance.freeTool(queryCapRatingDistributionTool);

    _mcpInstance.paidTool(rateCapTool);
    _mcpInstance.paidTool(uploadCapTool);
    _mcpInstance.paidTool(favoriteCapTool);
    _mcpInstance.paidTool(updateEnableCapTool);
  }
  return _mcpInstance;
}