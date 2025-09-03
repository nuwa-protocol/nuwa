import {DIDAuth, initRoochVDR, VDRRegistry} from "@nuwa-ai/identity-kit";
import {IPFS_NODE, IPFS_NODE_PORT, IPFS_NODE_URL, TARGET} from "../constant.js";
import { FastMCP } from "fastmcp";
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

const registry = VDRRegistry.getInstance();
initRoochVDR(TARGET, undefined, registry);

export const authenticateRequest = async (request: any) => {
  // Extract authorization header
  const header =
    typeof request.headers?.get === "function"
      ? request.headers.get("authorization")
      : request.headers["authorization"] ?? request.headers["Authorization"];

  const prefix = "DIDAuthV1 ";
  if (!header || !header.startsWith(prefix)) {
    throw new Response(undefined, { status: 401, statusText: "Missing DIDAuthV1 header" });
  }

  // Verify DID authentication
  const verify = await DIDAuth.v1.verifyAuthHeader(header, registry);
  if (!verify.ok) {
    const msg = (verify as { error: string }).error;
    throw new Response(`Invalid DIDAuth: ${msg}`, { status: 403 });
  }

  // Return signer DID
  const signerDid = verify.signedObject.signature.signer_did;
  return { did: signerDid };
};

export const ipfsService = new FastMCP({
  name: "nuwa-ipfs-service",
  version: "1.0.0",
  authenticate: authenticateRequest
});

ipfsService.addTool(uploadCapTool);
ipfsService.addTool(downloadCapTool);
ipfsService.addTool(favoriteCapTool);
ipfsService.addTool(queryCapByIDTool);
ipfsService.addTool(queryCapByNameTool);
ipfsService.addTool(queryCapStatsTool);
ipfsService.addTool(queryMyFavoriteCapTool);
ipfsService.addTool(rateCapTool);
ipfsService.addTool(updateEnableCapTool);