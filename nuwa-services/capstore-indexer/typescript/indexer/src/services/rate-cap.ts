import { z } from "zod";
import { queryFromSupabase, rateCap as rateCapInSupabase } from "../supabase.js";
import type { Result } from "../type.js";

async function rateCap({ capId, rating }: { capId: string, rating: number }, context: any) {
  try {
    const userDID = context.session.did;
    const result = await queryFromSupabase(capId, null);

    if (!result.success || !result.items || result.items.length === 0) {
      return {
        content: [{
          type: "text",
          text: JSON.stringify({
            code: 404,
            error: result.error || 'No matching records found',
          } as Result)
        }]
      };
    }

    const rateResult = await rateCapInSupabase(userDID, capId, rating);
    if (!rateResult.success) {
      return {
        content: [{
          type: "text",
          text: JSON.stringify({
            code: 500,
            error: rateResult.error || 'Failed to rate cap',
          } as Result)
        }]
      };
    }

    return {
      content: [{
        type: "text",
        text: JSON.stringify({
          code: 200,
        })
      }]
    };
  } catch (error) {
    return {
      content: [{
        type: "text",
        text: JSON.stringify({
          code: 500,
          error: (error as Error).message || 'Unknown error occurred'
        } as Result)
      }]
    };
  }
}

export const rateCapTool = {
  name: "rateCap",
  description: "rate cap",
  parameters: z.object({
    capId: z.string().describe("Resource identifier"),
    rating: z.number().describe("Rating"),
  }),
  annotations: {
    readOnlyHint: true,
    openWorldHint: true
  },
  execute: rateCap
};