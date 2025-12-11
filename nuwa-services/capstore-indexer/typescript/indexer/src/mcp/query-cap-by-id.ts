import { z } from 'zod';
import { queryFromSupabase } from '../supabase.js';
import type { Result } from '../type.js';

async function queryCapByID(args: { id?: string; cid?: string }) {
  try {
    console.log('[queryCapByID] Query started:', {
      id: args.id,
      cid: args.cid,
      timestamp: new Date().toISOString(),
    });
    
    const { id, cid } = args;
    const result = await queryFromSupabase(id, null, cid);

    if (!result.success || !result.items || result.items.length === 0) {
      console.warn('[queryCapByID] No matching records found:', {
        id,
        cid,
        error: result.error,
        timestamp: new Date().toISOString(),
      });
      
      return {
        content: [
          {
            type: 'text',
            text: JSON.stringify({
              code: 404,
              error: result.error || 'No matching records found',
            } as Result),
          },
        ],
      };
    }

    const item = result.items[0];
    console.log('[queryCapByID] Query successful:', {
      id,
      cid,
      itemId: item.id,
      timestamp: new Date().toISOString(),
    });
    
    // MCP standard response with pagination info
    return {
      content: [
        {
          type: 'text',
          text: JSON.stringify({
            code: 200,
            data: item,
          }),
        },
      ],
    };
  } catch (error) {
    console.error('[queryCapByID] Query failed:', {
      id: args.id,
      cid: args.cid,
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
            error: (error as Error).message || 'Unknown error occurred',
          } as Result),
        },
      ],
    };
  }
}

export const queryCapByIDTool = {
  name: 'queryCapByID',
  description: 'Query cap by id',
  parameters: z.object({
    id: z.string().optional().describe('Resource identifier'),
    cid: z.string().optional().describe('Resource identifier'),
  }),
  annotations: {
    readOnlyHint: true,
    openWorldHint: true,
  },
  execute: queryCapByID,
};
