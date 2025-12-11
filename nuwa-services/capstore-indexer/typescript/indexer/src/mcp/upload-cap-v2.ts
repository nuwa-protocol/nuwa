import z from 'zod';
import { Readable } from 'node:stream';
import { ipfsClient } from '../service.js';
import { CID } from 'multiformats/cid';

import { Result } from '../type.js';
import { saveCapToSupabaseV2 } from '../supabase.js';

async function uploadCap(input: { cap: string }, context: any) {
  try {
    console.log('[uploadCap] Starting upload:', {
      uploaderDid: context?.didInfo?.did,
      timestamp: new Date().toISOString(),
    });
    
    const uploaderDid = context.didInfo.did;

    const result = await saveCapToSupabaseV2(input.cap);

    console.log('[uploadCap] Successfully uploaded cap:', {
      uploaderDid,
      timestamp: new Date().toISOString(),
    });

    // MCP standard response format
    return {
      content: [
        {
          type: 'text',
          text: JSON.stringify({
            code: 200,
            data: {},
          } as Result),
        },
      ],
    };
  } catch (error) {
    console.error('[uploadCap] Upload failed:', {
      uploaderDid: context?.didInfo?.did,
      error: error instanceof Error ? error.message : String(error),
      stack: error instanceof Error ? error.stack : undefined,
      timestamp: new Date().toISOString(),
    });
    
    return {
      content: [
        {
          type: 'text',
          text: JSON.stringify({
            code: 500,
            error: error instanceof Error ? error.message : String(error),
          } as Result),
        },
      ],
    };
  }
}

export const uploadCapTool = {
  name: 'uploadCap',
  description: 'Upload a cap to supabase',
  parameters: z.object({
    cap: z.string().describe('Base64 encoded file data'),
  }),
  pricePicoUSD: BigInt(1000000000), // 0.001 USD
  execute: uploadCap,
};
