import { getCapRatingDistribution } from '../supabase.js';
import type { Result } from '../type.js';
import { z } from 'zod';

async function queryCapRatingDistribution({ capId }: { capId: string }, context: any) {
  try {
    const userDID = context.didInfo.did;

    if (!userDID) {
      return {
        content: [
          {
            type: 'text',
            text: JSON.stringify({
              code: 401,
              error: 'User DID is required',
            } as Result),
          },
        ],
      };
    }

    if (!capId || capId.trim() === '') {
      return {
        content: [
          {
            type: 'text',
            text: JSON.stringify({
              code: 400,
              error: 'Cap ID is required',
            } as Result),
          },
        ],
      };
    }

    const result = await getCapRatingDistribution(capId);

    if (!result.success) {
      return {
        content: [
          {
            type: 'text',
            text: JSON.stringify({
              code: 500,
              error: result.error || 'Failed to get rating distribution',
            } as Result),
          },
        ],
      };
    }

    const distribution = result.distribution || [];

    const responseData = {
      distribution: distribution,
      capId: capId,
    };

    return {
      content: [
        {
          type: 'text',
          text: JSON.stringify({
            code: 200,
            data: responseData,
          } as Result),
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
            error: error instanceof Error ? error.message : 'Unknown error occurred',
          } as Result),
        },
      ],
    };
  }
}

export const queryCapRatingDistributionTool = {
  name: 'queryCapRatingDistribution',
  description: 'Query rating distribution for a specific cap (count of users for each rating 1-5)',
  parameters: z.object({
    capId: z.string().describe('The ID of the cap to query rating distribution for'),
  }),
  execute: queryCapRatingDistribution,
};
