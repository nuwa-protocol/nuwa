import { FastMCP } from "fastmcp";
import { config } from 'dotenv';
import {queryCID, setupRoochEventListener} from './eventHandle';
import {DIDAuth, VDRRegistry} from "@nuwa-ai/identity-kit";

config();

const mcp = new FastMCP({
  name: "ipfs-indexer",
  version: "1.0.0",
  authenticate: async (request) => {
    const header = request.headers.get("authorization");
    if (!header || !header.startsWith("DIDAuthV1 ")) {
      throw new Response("Missing DIDAuthV1 header", { status: 401 });
    }

    const verify = await DIDAuth.v1.verifyAuthHeader(
      header,
      VDRRegistry.getInstance()
    );

    if (!verify.ok) {
      throw new Response(`Invalid DIDAuth: ${(verify as any).error}`, { status: 403 });
    }

    return { did: verify.signedObject.signature.signer_did };
  },
});

setupRoochEventListener();

mcp.addTool({
  name: "queryCID",
  description: "Query CID by name and ID",
  parameters: {
    type: "object",
    properties: {
      name: {
        type: "string",
        description: "Resource name"
      },
      id: {
        type: "string",
        description: "Resource identifier"
      }
    },
    required: ["name", "id"]
  },
  annotations: {
    readOnlyHint: true,
    openWorldHint: true
  },
  async execute(args) {
    try {
      const { name, id } = args;
      if (!name || !id) throw new Error('Missing name or id parameter');

      const {success, cid} = await queryCID(name, id)

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

mcp.start({
  transportType: "httpStream",
  httpStream: {
    port: 3000,
    endpoint: "/mcp"
  }
}).then(() => {
  console.log('MCP service running on port 3000');
});