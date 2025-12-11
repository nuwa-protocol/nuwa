import z from 'zod';
import { Result } from '../type.js';
import { downloadFromSupabase } from '../supabase.js';

async function downloadCap({ id }: { id: string }, context: any) {
  try {
    console.log('[downloadCap] Starting download for cap:', { id, timestamp: new Date().toISOString() });
    
    const capRaw = await downloadFromSupabase(id);

    if (capRaw.error) {
      console.error('[downloadCap] Failed to download cap:', {
        id,
        error: capRaw.error,
        timestamp: new Date().toISOString(),
      });
      
      return {
        content: [
          {
            type: 'text',
            text: JSON.stringify({
              code: 404,
              error: capRaw.error,
            }),
          },
        ],
      };
    }

    console.log('[downloadCap] Successfully downloaded cap:', { id, timestamp: new Date().toISOString() });

    // MCP standard response format
    return {
      content: [
        {
          type: 'text',
          text: JSON.stringify({
            code: 200,
            data: {
              id,
              rawData: capRaw.data.raw_data,
              timestamp: new Date().toISOString(),
            },
          } as Result),
        },
      ],
    };
  } catch (error) {
    console.error('[downloadCap] Unexpected error:', {
      id,
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
            error: error instanceof Error ? error.message : 'Download failed',
          }),
        },
      ],
    };
  }
}

export const downloadCapTool = {
  name: 'downloadCap',
  description: 'Download a cap',
  parameters: z.object({
    id: z.string().describe('cap id'),
  }),
  execute: downloadCap,
};
