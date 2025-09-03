import z from "zod";
import { queryUserFavoriteCaps } from "../supabase.js";
import { Result } from "../type.js";

async function queryMyFavoriteCap({ page, pageSize }: { page?: number, pageSize?: number }, context: any) {
  try {
    const userDID = context.session.did;
    const result = await queryUserFavoriteCaps(userDID, page, pageSize);

    if (!result.success) {
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

    // MCP standard response with pagination info
    return {
      content: [{
        type: "text",
        text: JSON.stringify({
          code: 200,
          data: {
            totalItems: result.totalItems,
            page,
            pageSize,
            totalPages: Math.ceil(result.totalItems / pageSize),
            items: result.items
          }
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

export const queryMyFavoriteCapTool = {
  name: "queryMyFavoriteCap",
  description: "query my favorite caps",
  parameters: z.object({
    page: z.number().optional().default(0).describe("Page number starting from 0"),
    pageSize: z.number().optional().default(50).describe("Number of records per page")
  }),
  annotations: {
    readOnlyHint: true,
    openWorldHint: true
  },
  execute: queryMyFavoriteCap
};