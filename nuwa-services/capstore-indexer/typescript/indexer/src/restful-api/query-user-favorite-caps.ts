import { IncomingMessage, ServerResponse } from 'http';
import { queryFromSupabase, queryUserFavoriteCaps } from '../supabase.js';
import {parseQueryParams, sendJson} from './utils.js';

/**
 * GET /api/caps/did
 * Query cap by did
 */
export async function handleQueryUserFavoriteCaps(
  req: IncomingMessage,
  res: ServerResponse,
): Promise<void> {
  try {
    const params = parseQueryParams(req.url || '');

    // Extract query parameters
    const did = params.did as string | undefined;
    const page = params.page ? parseInt(params.page as string, 10) : 0;
    const pageSize = params.pageSize ? parseInt(params.pageSize as string, 10) : 50;
    const result = await queryUserFavoriteCaps(did, page, pageSize);

    if (!result.success || !result.items || result.items.length === 0) {
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
        items: result.items
      }
    });
  } catch (error) {
    sendJson(res, 500, {
      code: 500,
      error: (error as Error).message || 'Unknown error occurred',
    });
  }
}
