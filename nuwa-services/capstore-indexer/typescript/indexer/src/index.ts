import { FastMCP } from "fastmcp";
import { config } from 'dotenv';
import { z } from "zod";
import { DIDAuth, VDRRegistry, initRoochVDR } from "@nuwa-ai/identity-kit";
import { create } from 'ipfs-http-client';
import { CID } from 'multiformats/cid';
import { Readable } from 'stream';
import { setupRoochEventListener } from './eventHandle.js';
import { queryCIDFromSupabase } from "./supabase";

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
initRoochVDR("local", undefined, registry);

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
// CID Query Tool with Pagination Support
// -----------------------------------------------------------------------------
ipfsService.addTool({
  name: "queryCID",
  description: "Query CIDs by name and ID with pagination support",
  parameters: z.object({
    name: z.string().optional().describe("Resource name (optional)"),
    id: z.string().optional().describe("Resource identifier (optional)"),
    page: z.number().optional().default(0).describe("Page number starting from 0"),
    pageSize: z.number().optional().default(50).describe("Number of records per page")
  }),
  annotations: {
    readOnlyHint: true,
    openWorldHint: true
  },
  async execute(args) {
    try {
      const { name, id, page, pageSize } = args;
      const result = await queryCIDFromSupabase(name, id, page, pageSize);

      if (!result.success) {
        return {
          content: [{
            type: "text",
            text: JSON.stringify({
              success: false,
              name,
              id,
              page,
              pageSize,
              error: result.error || 'No matching records found'
            })
          }]
        };
      }

      // MCP standard response with pagination info
      return {
        content: [{
          type: "text",
          text: JSON.stringify({
            success: false,
            totalItems: result.totalItems,
            page,
            pageSize,
            totalPages: Math.ceil(result.totalItems / pageSize),
            items: result.items.map(item => ({
              name: item.name,
              id: item.id,
              cid: item.cid,
            }))
          })
        }]
      };
    } catch (error) {
      return {
        content: [{
          type: "text",
          text: (error as Error).message || 'Unknown error occurred',
        }]
      };
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
        return {
          parts: [{
            type: "auth-error",
            text: "Authentication required",
            data: { code: 401 }
          }]
        };
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

      // MCP standard response format
      return {
        content: [{
          type: "text",
          text: JSON.stringify({
            success: true,
            fileName,
            ipfsCid: ipfsCid.toString(),
            uploaderDid,
            timestamp: new Date().toISOString(),
            ipfsUrl: `ipfs://${ipfsCid.toString()}`,
            gatewayUrl: `https://ipfs.io/ipfs/${ipfsCid.toString()}`
          })
        }]
      };
    } catch (error) {
      console.error("File upload error:", error);
      return {
        content: [{
          type: "text",
          success: false,
          text: JSON.stringify({
            fileName,
            error: error instanceof Error ? error.message : String(error)
          })
        }]
      };
    }
  },
});

// -----------------------------------------------------------------------------
// File Download Tool
// -----------------------------------------------------------------------------
ipfsService.addTool({
  name: "downloadFile",
  description: "Download a file from IPFS using its CID",
  parameters: z.object({
    cid: z.string().describe("Content Identifier (CID) of the file"),
    dataFormat: z.enum(['base64', 'utf8']).optional().default('base64')
      .describe("Output format for file data")
  }),
  async execute({ cid, dataFormat }, context) {
    try {
      if (!context.session?.did) {
        return {
          content: [{
            type: "text",
            text: "Authentication required",
            data: { code: 401 }
          }]
        };
      }

      const downloaderDid = context.session.did;
      console.log(`📥 Download request from DID: ${downloaderDid}, CID: ${cid}`);

      // CID format validation
      if (!/^Qm[1-9A-HJ-NP-Za-km-z]{44}$|^b[A-Za-z0-9]{58}$/.test(cid)) {
        return {
          parts: [{
            type: "validation-error",
            text: "Invalid CID format",
            data: { cid }
          }]
        };
      }

      // Check if file exists
      let fileExists = false;
      for await (const _ of ipfsClient.files.ls(`/ipfs/${cid}`)) {
        fileExists = true;
        break;
      }
      if (!fileExists) {
        return {
          content: [{
            type: "text",
            text: `File not found: ${cid}`,
          }]
        };
      }

      // Download file
      const chunks = [];
      let totalSize = 0;

      for await (const chunk of ipfsClient.cat(cid)) {
        chunks.push(chunk);
        totalSize += chunk.length;
      }

      const fileBuffer = Buffer.concat(chunks, totalSize);

      // Format data
      let formattedData;
      if (dataFormat === 'base64') {
        formattedData = fileBuffer.toString('base64');
      } else {
        formattedData = fileBuffer.toString('utf8');
      }


      // MCP standard response format
      return {
        content: [{
          type: "text",
          text: JSON.stringify({
            cid,
            size: totalSize,
            format: formattedData,
            dataFormat,
            gatewayUrl: `https://ipfs.io/ipfs/${cid}`,
            timestamp: new Date().toISOString()
          }),
        }]
      };
    } catch (error) {
      console.error(`Download error for CID ${cid}:`, error);
      return {
        content: [{
          type: "text",
          text: JSON.stringify({
            cid,
            error: error instanceof Error ? error.message : 'Unknown download error'
          })
        }]
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
  console.log('📥 Use "downloadFile" to retrieve content');
  console.log('🌐 Access IPFS content at: ipfs://{cid}');
});