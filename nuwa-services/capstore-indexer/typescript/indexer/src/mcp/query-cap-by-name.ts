import z from 'zod';
import { queryFromSupabase } from '../supabase.js';
import { Result } from '../type.js';

async function queryCapByName(args: {
  name?: string;
  tags?: string[];
  page?: number;
  pageSize?: number;
  sortBy?: 'average_rating' | 'downloads' | 'favorites' | 'rating_count' | 'updated_at';
  sortOrder?: 'asc' | 'desc';
}) {
  try {
    const { name, tags, page, pageSize, sortBy, sortOrder } = args;
    const result = await queryFromSupabase(
      null,
      name,
      null,
      tags,
      page,
      pageSize,
      sortBy,
      sortOrder
    );

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
            data: {
              totalItems: result.totalItems,
              page,
              pageSize,
              totalPages: Math.ceil(result.totalItems / pageSize),
              items: result.items,
            },
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

export const queryCapByNameTool = {
  name: 'queryCapByName',
  description: 'Query cap by name',
  parameters: z.object({
    name: z.string().optional().describe('cap name or display name (optional)'),
    tags: z.array(z.string()).optional().describe('cap tags (optional)'),
    page: z.number().optional().default(0).describe('Page number starting from 0'),
    pageSize: z.number().optional().default(50).describe('Number of records per page'),
    sortBy: z
      .enum(['average_rating', 'downloads', 'favorites', 'rating_count', 'updated_at'])
      .optional()
      .describe('Sort by field (optional)'),
    sortOrder: z
      .enum(['asc', 'desc'])
      .optional()
      .default('desc')
      .describe('Sort order: ascending or descending (default: desc)'),
  }),
  execute: queryCapByName,
};
