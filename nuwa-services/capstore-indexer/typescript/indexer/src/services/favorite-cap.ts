import z from "zod";
import { addToUserFavoriteCaps, removeFromUserFavoriteCaps } from "../supabase";
import { Result } from "../type";

async function favoriteCap({ capId, action }: { capId: string, action: 'add' | 'remove' }, context: any) {
  try {
    const userDID = context.session.did;
    let result: {
      success: boolean;
      error?: string;
    };
    if (action === "add") {
      result = await addToUserFavoriteCaps(userDID, capId);
    } else {
      result = await removeFromUserFavoriteCaps(userDID, capId);
    }

    if (!result.success) {
      return {
        content: [{
          type: "text",
          text: JSON.stringify({
            code: 404,
            error: result.error || action === 'add' ? 'Failed to add to favorite cap' : 'Failed to remove from favorite cap',
          } as Result)
        }]
      };
    }

    // MCP standard response with pagination info
    return {
      content: [{
        type: "text",
        text: JSON.stringify({
          code: 200,
        } as Result)
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

export const favoriteCapTool = {
  name: "favoriteCap",
  description: "favorite cap",
  parameters: z.object({
    capId: z.string().describe("Cap ID"),
    action: z.enum(["add", "remove"]).describe("Action to perform")
  }),
  annotations: {
    readOnlyHint: true,
    openWorldHint: true
  },
  execute: favoriteCap
};