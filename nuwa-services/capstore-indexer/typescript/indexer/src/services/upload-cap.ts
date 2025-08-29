import z from "zod";
import { Readable } from 'node:stream';
import { ipfsClient } from "./service";
import { CID } from 'multiformats/cid';
import { Result } from "../type";

async function uploadCap({ fileName, fileData, pin }: { fileName: string, fileData: string, pin: boolean }, context: any) {
  try {
    // Authentication check
    if (!context.session?.did) {
      return {
        content: [{
          type: "text",
          text: JSON.stringify({
            code: 401,
            error: "Authentication required"
          })
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
          code: 200,
          data: {
            fileName,
            ipfsCid: ipfsCid.toString(),
            uploaderDid,
            timestamp: new Date().toISOString(),
            ipfsUrl: `ipfs://${ipfsCid.toString()}`,
            gatewayUrl: `https://ipfs.io/ipfs/${ipfsCid.toString()}`
          }
        } as Result)
      }]
    };
  } catch (error) {
    return {
      content: [{
        type: "text",
        text: JSON.stringify({
          code: 500,
          error: error instanceof Error ? error.message : String(error)
        } as Result)
      }]
    };
  }
}

export const uploadCapTool = {
  name: "uploadCap",
  description: "Upload a cap to IPFS & rooch blockchain",
  parameters: z.object({
    fileName: z.string().describe("Name of the file"),
    fileData: z.string().describe("Base64 encoded file data"),
    pin: z.boolean().optional().default(true).describe("Pin the file on IPFS")
  }),
  execute: uploadCap
};