import z from 'zod';
import { queryCapStats as queryCapStatsFromSupabase } from '../supabase.js';
import { Result } from '../type.js';

async function queryCapStats({ capId }: { capId: string }, context: any) {
  try {
    const userDID = context.didInfo.did;
    const result = await queryCapStatsFromSupabase(capId, userDID);

    if (!result.success) {
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

    // MCP standard response with pagination info
    return {
      content: [
        {
          type: 'text',
          text: JSON.stringify({
            code: 200,
            data: result.stats,
          }),
        },
      ],
    };
  } catch (error) {
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

export const queryCapStatsTool = {
  name: 'queryCapStats',
  description: 'query cap stats',
  parameters: z.object({
    capId: z.string().describe('Cap ID'),
  }),
  annotations: {
    readOnlyHint: true,
    openWorldHint: true,
  },
  execute: queryCapStats,
};
