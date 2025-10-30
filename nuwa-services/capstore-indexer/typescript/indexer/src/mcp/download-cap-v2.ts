import z from "zod";
import { Result } from "../type.js";
import { downloadFromSupabase } from "../supabase.js";

async function downloadCap({id}: {id: string}, context: any) {
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
            rawData: capRaw.data.raw_data,
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
  description: "Download a cap",
  parameters: z.object({
    id: z.string().describe("cap id"),
  }),
  execute: downloadCap
};
