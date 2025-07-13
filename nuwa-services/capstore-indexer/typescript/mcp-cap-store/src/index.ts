import { FastMCP } from "fastmcp";
import { z } from "zod";
import { DIDAuth, VDRRegistry, initRoochVDR } from "@nuwa-ai/identity-kit";
import { create } from 'ipfs-http-client';
import { CID } from 'multiformats/cid';
import { Readable } from 'stream';
import { config } from 'dotenv';


config();

// Initialize IPFS client (connects to go-ipfs node)
let ipfsClient: any;

(async () => {
  try {
    // Create IPFS HTTP client (connects to go-ipfs)
    ipfsClient = create({
      host: process.env.IPFS_HOST || 'localhost',
      port: process.env.IPFS_PORT ? parseInt(process.env.IPFS_PORT) : 5001,
      protocol: 'http'
    });

    // Verify connection by getting node information
    const nodeId = await ipfsClient.id();
    console.log('✅ IPFS client initialized');
    console.log(`🌐 Connected to go-ipfs node: ${nodeId.id}`);
  } catch (error) {
    console.error('❌ Failed to initialize IPFS client:', error);
    process.exit(1);
  }
})();

// -----------------------------------------------------------------------------
// Initialize VDRRegistry with default VDRs (rooch, key)
// -----------------------------------------------------------------------------
const registry = VDRRegistry.getInstance();
initRoochVDR("test", undefined, registry);

// -----------------------------------------------------------------------------
// FastMCP server with DIDAuth
// -----------------------------------------------------------------------------
const server = new FastMCP({
  name: "ipfs-upload-service",
  version: "1.0.0",

  /**
   * Authentication middleware for all requests
   * Validates DIDAuthV1 header and verifies signature
   */
  authenticate: async (request: any) => {
    try {
      // Extract authorization header from request
      const header =
        typeof request.headers?.get === "function"
          ? request.headers.get("authorization")
          : request.headers["authorization"] ?? request.headers["Authorization"];

      const prefix = "DIDAuthV1 ";
      if (!header || !header.startsWith(prefix)) {
        throw new Response(undefined, { status: 401, statusText: "Missing DIDAuthV1 header" });
      }

      // Verify DID authentication signature
      const verify = await DIDAuth.v1.verifyAuthHeader(header, VDRRegistry.getInstance());
      if (!verify.ok) {
        const msg = (verify as { error: string }).error;
        throw new Response(`Invalid DIDAuth: ${msg}`, { status: 403 });
      }

      // Extract signer DID from verification result
      const signerDid = verify.signedObject.signature.signer_did;
      return { did: signerDid };
    } catch (error) {
      throw new Response(undefined, { status: 401, statusText: "Unauthorized" });
    }
  },
});

// -----------------------------------------------------------------------------
// File Upload Tool
// -----------------------------------------------------------------------------
server.addTool({
  name: "uploadFile",
  description: "Upload a file to IPFS using go-ipfs",
  parameters: z.object({
    fileName: z.string().describe("Name of the file"),
    fileData: z.string().describe("Base64 encoded file data"),
    pin: z.boolean().optional().default(true).describe("Pin the file on IPFS")
  }),
  async execute({ fileName, fileData, pin }, context) {
    try {
      // Verify DID authentication
      if (!context.session?.did) {
        throw new Error("Authentication required");
      }

      const uploaderDid = context.session.did;
      console.log(`📤 Upload request from DID: ${uploaderDid}, File: ${fileName}`);

      // Convert Base64 to Uint8Array
      const buffer = Buffer.from(fileData, 'base64');
      const data = new Uint8Array(buffer);

      // Upload file to go-ipfs
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
// Resource: File Information
// -----------------------------------------------------------------------------
server.addResourceTemplate({
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
      // Get file information from go-ipfs
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
          error: "文件未找到",
          cid: args.cid
        }),
        mimeType: "application/json"
      };
    }
  },
});

// -----------------------------------------------------------------------------
// Start server
// -----------------------------------------------------------------------------
server.start({
  transportType: "httpStream",
  httpStream: {
    port: 8081,
  },
});

console.log("✅ IPFS Upload Service listening on http://localhost:8080/mcp");
console.log("📤 Use the 'uploadFile' tool to upload files to IPFS");