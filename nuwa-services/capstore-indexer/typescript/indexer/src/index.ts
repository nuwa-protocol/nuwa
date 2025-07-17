import { FastMCP } from "fastmcp";
import { config } from 'dotenv';
import { z } from "zod";
import { DIDAuth, VDRRegistry, initRoochVDR } from "@nuwa-ai/identity-kit";
import { create } from 'ipfs-http-client';
import { CID } from 'multiformats/cid';
import { Readable } from 'stream';
import { queryCID, setupRoochEventListener } from './eventHandle';

// Load environment variables
config();

// -----------------------------------------------------------------------------
// IPFS Client Initialization
// -----------------------------------------------------------------------------
let ipfsClient: any;

(async () => {
  try {
    // Create IPFS HTTP client
    ipfsClient = create({
      host: process.env.IPFS_HOST || 'localhost',
      port: process.env.IPFS_PORT ? parseInt(process.env.IPFS_PORT) : 5001,
      protocol: 'http'
    });

    // Verify connection
    const nodeId = await ipfsClient.id();
    console.log('✅ IPFS client initialized');
    console.log(`🌐 Connected to go-ipfs node: ${nodeId.id}`);
  } catch (error) {
    console.error('❌ Failed to initialize IPFS client:', error);
    process.exit(1);
  }
})();

// -----------------------------------------------------------------------------
// Initialize VDRRegistry (Identity Verification)
// -----------------------------------------------------------------------------
const registry = VDRRegistry.getInstance();
initRoochVDR("test", undefined, registry);

// -----------------------------------------------------------------------------
// Event Listener Initialization
// -----------------------------------------------------------------------------
setupRoochEventListener();

// -----------------------------------------------------------------------------
// Unified Authentication Function
// -----------------------------------------------------------------------------
const authenticateRequest = async (request: any) => {
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
  const verify = await DIDAuth.v1.verifyAuthHeader(header, VDRRegistry.getInstance());
  if (!verify.ok) {
    const msg = (verify as { error: string }).error;
    throw new Response(`Invalid DIDAuth: ${msg}`, { status: 403 });
  }

  // Return signer DID
  const signerDid = verify.signedObject.signature.signer_did;
  return { did: signerDid };
};

// -----------------------------------------------------------------------------
// Create Unified FastMCP Service
// -----------------------------------------------------------------------------
const ipfsService = new FastMCP({
  name: "nuwa-ipfs-service",
  version: "1.0.0",
  authenticate: authenticateRequest
});

// -----------------------------------------------------------------------------
// CID Query Tool
// -----------------------------------------------------------------------------
ipfsService.addTool({
  name: "queryCID",
  description: "Query CID by name and ID",
  parameters: z.object({
    name: z.string().describe("Resource name"),
    id: z.string().describe("Resource identifier"),
  }),
  annotations: {
    readOnlyHint: true,
    openWorldHint: true
  },
  async execute(args) {
    try {
      const { name, id } = args;
      const { success, cid } = await queryCID(name, id);

      if (!success) throw new Error('Record not found');

      return JSON.stringify({
        success: true,
        cid: cid
      });
    } catch (error) {
      return JSON.stringify({
        success: false,
        error: (error as Error).message
      });
    }
  }
});

// -----------------------------------------------------------------------------
// File Upload Tool
// -----------------------------------------------------------------------------
ipfsService.addTool({
  name: "uploadFile",
  description: "Upload a file to IPFS",
  parameters: z.object({
    fileName: z.string().describe("Name of the file"),
    fileData: z.string().describe("Base64 encoded file data"),
    pin: z.boolean().optional().default(true).describe("Pin the file on IPFS")
  }),
  async execute({ fileName, fileData, pin }, context) {
    try {
      // Authentication check
      if (!context.session?.did) {
        throw new Error("Authentication required");
      }

      const uploaderDid = context.session.did;
      console.log(`📤 Upload request from DID: ${uploaderDid}, File: ${fileName}`);

      // Convert Base64 to Uint8Array
      const buffer = Buffer.from(fileData, 'base64');
      const data = new Uint8Array(buffer);

      // Upload to IPFS
      const ipfsResult = await ipfsClient.add({
        path: fileName,
        content: Readable.from([data])
      });

      const ipfsCid = CID.parse(ipfsResult.cid.toString());
      console.log(`🌐 File uploaded to IPFS: CID ${ipfsCid.toString()}`);

      // Pin file if requested
      if (pin) {
        await ipfsClient.pin.add(ipfsCid);
        console.log(`📌 Pinned file: ${ipfsCid.toString()}`);
      }

      return {
        success: true,
        ipfsCid: ipfsCid.toString(),
        fileName: fileName,
        uploaderDid: uploaderDid,
        timestamp: new Date().toISOString(),
        ipfsGatewayUrl: `https://ipfs.io/ipfs/${ipfsCid.toString()}`
      };
    } catch (error) {
      console.error("File upload error:", error);
      throw new Error(`Upload failed: ${error instanceof Error ? error.message : String(error)}`);
    }
  },
});

// -----------------------------------------------------------------------------
// IPFS Resource Access Point
// -----------------------------------------------------------------------------
ipfsService.addResourceTemplate({
  uriTemplate: "ipfs://{cid}",
  name: "IPFS File Information",
  mimeType: "application/json",
  arguments: [
    {
      name: "cid",
      description: "Content Identifier (CID) of the file",
      required: true,
    },
  ],
  async load(args) {
    try {
      // Retrieve file information from IPFS
      const stats = await ipfsClient.files.stat(`/ipfs/${args.cid}`);
      return {
        blob: JSON.stringify({
          cid: args.cid,
          size: stats.size,
          type: stats.type,
          blocks: stats.blocks,
          withLocality: stats.withLocality,
          local: stats.local,
          sizeLocal: stats.sizeLocal,
          ipfsGatewayUrl: `https://ipfs.io/ipfs/${args.cid}`
        }),
        mimeType: "application/json"
      };
    } catch (error) {
      return {
        blob: JSON.stringify({
          error: "File not found",
          cid: args.cid
        }),
        mimeType: "application/json"
      };
    }
  },
});

// -----------------------------------------------------------------------------
// Start Service
// -----------------------------------------------------------------------------
ipfsService.start({
  transportType: "httpStream",
  httpStream: {
    port: 3000,
    endpoint: "/mcp"
  }
}).then(() => {
  console.log('✅ Nuwa IPFS Service running on port 3000');
  console.log('🔍 Use "queryCID" to find content');
  console.log('📤 Use "uploadFile" to upload content');
  console.log('🌐 Access IPFS content at: ipfs://{cid}');
});