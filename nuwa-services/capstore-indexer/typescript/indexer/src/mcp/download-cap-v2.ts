import z from "zod";
import { Result } from "../type.js";
import { downloadFromSupabase } from "../supabase.js";

async function downloadCap(id: string, context: any) {
  try {
    const capRaw = await downloadFromSupabase(id);

    if (capRaw.error) {
      return {
        content: [{
          type: "text",
          text: JSON.stringify({
            code: 404,
            error: capRaw.error
          })
        }]
      };
    }

    // MCP standard response format
    return {
      content: [{
        type: "text",
        text: JSON.stringify({
          code: 200,
          data: {
            id,
            rawData: capRaw,
            timestamp: new Date().toISOString()
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
          error: error instanceof Error ? error.message : 'Download failed'
        })
      }]
    };
  }
}

export const downloadCapTool = {
  name: "downloadCap",
  description: "Download a cap from IPFS using its CID",
  parameters: z.object({
    cid: z.string().describe("Content Identifier (CID) of the file"),
    dataFormat: z.enum(['base64', 'utf8']).optional().default('utf8')
      .describe("Output format for file data")
  }),
  execute: downloadCap
};
