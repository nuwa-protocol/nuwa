import z from "zod";
import { Readable } from 'node:stream';
import { ipfsClient } from "../service.js";
import { CID } from 'multiformats/cid';

import { Result } from "../type.js";
import { saveCapToSupabaseV2 } from "../supabase.js";

async function uploadCap(input: { cap: string }, context: any) {
  try {
    const uploaderDid = context.didInfo.did;

    const result = await saveCapToSupabaseV2(input.cap)

    // MCP standard response format
    return {
      content: [{
        type: "text",
        text: JSON.stringify({
          code: 200,
          data: {}
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
  name: "uploadCapV2",
  description: "Upload a cap to supabase",
  parameters: z.object({
    cap: z.string().describe("Base64 encoded file data"),
  }),
  pricePicoUSD: BigInt(1000000000), // 0.001 USD
  execute: uploadCap
};
