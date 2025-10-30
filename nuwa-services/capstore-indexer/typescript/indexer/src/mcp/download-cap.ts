import z from "zod";
import { ipfsClient } from "../service.js";
import { Result } from "../type.js";
import { incrementCapDownloads, queryFromSupabase } from "../supabase.js";

async function downloadCap({ cid, dataFormat }: { cid: string, dataFormat: 'base64' | 'utf8' }, context: any) {
  try {
    if (!/^Qm[1-9A-HJ-NP-Za-km-z]{44}$|^b[A-Za-z0-9]{58}$/.test(cid)) {
      return {
        content: [{
          type: "text",
          text: JSON.stringify({
            code: 500,
            error: "The CID format does not meet the requirements",
          })
        }]
      };
    }

    const caps = await queryFromSupabase(null, null, cid);

    if (caps.items && caps.items.length > 0) {
      const cap = caps.items[0];
      const updateDownloadCount = await incrementCapDownloads(cap.id);
      if (!updateDownloadCount.success) {
        return {
          content: [{
            type: "text",
            text: JSON.stringify({
              code: 500,
              error: "Failed to increment download count"
            } as Result)
          }]
        };
      }
    }

    // Download file directly - IPFS will throw an error if CID doesn't exist
    const chunks = [];
    let totalSize = 0;

    try {
      for await (const chunk of ipfsClient.cat(cid, {
        timeout: 15 * 1000
      })) {
        chunks.push(chunk);
        totalSize += chunk.length;
      }
    } catch (catError) {
      // Handle IPFS-specific errors
      const errorMessage = catError instanceof Error ? catError.message : String(catError);
      if (errorMessage.includes('not found') || errorMessage.includes('no link named') || errorMessage.includes('deadline')) {
        return {
          content: [{
            type: "text",
            text: JSON.stringify({
              code: 404,
              error: `File not found in IPFS: ${cid}`
            } as Result)
          }]
        };
      }
      // Re-throw other errors to be caught by outer catch
      throw catError;
    }

    const fileBuffer = Buffer.concat(chunks, totalSize);

    // Format data
    let formattedData: string;
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
          code: 200,
          data: {
            cid,
            size: totalSize,
            fileData: formattedData,
            dataFormat,
            gatewayUrl: `https://ipfs.io/ipfs/${cid}`,
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