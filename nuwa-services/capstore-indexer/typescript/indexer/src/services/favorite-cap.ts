import z from "zod";
import { addToUserFavoriteCaps, removeFromUserFavoriteCaps, isUserFavoriteCap } from "../supabase.js";
import { Result } from "../type.js"; 

async function favoriteCap({ capId, action }: { capId: string, action: 'add' | 'remove' | 'isFavorite' }, context: any) {
  try {
    const userDID = context.session.did;
    
    if (action === "isFavorite") {
      const result = await isUserFavoriteCap(userDID, capId);
      
      if (!result.success) {
        return {
          content: [{
            type: "text",
            text: JSON.stringify({
              code: 404,
              error: result.error || 'Failed to check if cap is favorite',
            } as Result)
          }]
        };
      }

      return {
        content: [{
          type: "text",
          text: JSON.stringify({
            code: 200,
            isFavorite: result.isFavorite,
          } as Result)
        }]
      };
    }

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
    action: z.enum(["add", "remove", "isFavorite"]).describe("Action to perform")
  }),
  annotations: {
    readOnlyHint: true,
    openWorldHint: true
  },
  execute: favoriteCap
};