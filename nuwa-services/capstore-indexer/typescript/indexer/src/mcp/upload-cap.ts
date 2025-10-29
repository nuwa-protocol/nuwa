import z from "zod";
import { Readable } from 'node:stream';
import { ipfsClient } from "../service.js";
import { CID } from 'multiformats/cid';
import { Result } from "../type.js";

async function uploadCap({ fileName, fileData, pin }: { fileName: string, fileData: string, pin: boolean }, context: any) {
  try {
    const uploaderDid = context.didInfo.did;
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
  pricePicoUSD: BigInt(1000000000), // 0.001 USD
  execute: uploadCap
};