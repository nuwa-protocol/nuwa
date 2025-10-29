import { IncomingMessage, ServerResponse } from 'http';
import { queryFromSupabase } from '../supabase.js';
import { sendJson, parseQueryParams } from './utils.js';

/**
 * GET /api/caps
 * Query caps with search, filter, pagination and sorting
 */
export async function handleQueryCaps(
  req: IncomingMessage,
  res: ServerResponse
): Promise<void> {
  try {
    const params = parseQueryParams(req.url || '');
    
    // Extract query parameters
    const name = params.name as string | undefined;
    const tagsParam = params.tags;
    const tags = tagsParam 
      ? (Array.isArray(tagsParam) ? tagsParam : [tagsParam])
      : undefined;
    const page = params.page ? parseInt(params.page as string, 10) : 0;
    const pageSize = params.pageSize ? parseInt(params.pageSize as string, 10) : 50;
    const sortBy = params.sortBy as any;
    const sortOrder = (params.sortOrder as 'asc' | 'desc') || 'desc';

    // Query from database
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
      sendJson(res, 404, {
        code: 404,
        error: result.error || 'No matching records found',
      });
      return;
    }

    sendJson(res, 200, {
      code: 200,
      data: {
        totalItems: result.totalItems,
        page,
        pageSize,
        totalPages: Math.ceil(result.totalItems / pageSize),
        items: result.items,
      },
    });
  } catch (error) {
    sendJson(res, 500, {
      code: 500,
      error: (error as Error).message || 'Unknown error occurred',
    });
  }
}

