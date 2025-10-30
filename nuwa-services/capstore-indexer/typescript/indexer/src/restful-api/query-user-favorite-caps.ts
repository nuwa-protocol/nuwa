import { IncomingMessage, ServerResponse } from 'http';
import { queryFromSupabase, queryUserFavoriteCaps } from '../supabase.js';
import { sendJson } from './utils.js';

/**
 * GET /api/caps/did
 * Query cap by did
 */
export async function handleQueryUserFavoriteCaps(
  req: IncomingMessage,
  res: ServerResponse,
  did: string,
): Promise<void> {
  try {
    const result = await queryUserFavoriteCaps(did);

    if (!result.success || !result.items || result.items.length === 0) {
      sendJson(res, 404, {
        code: 404,
        error: result.error || 'No matching records found',
      });
      return;
    }

    sendJson(res, 200, {
      code: 200,
      data: result.items[0],
    });
  } catch (error) {
    sendJson(res, 500, {
      code: 500,
      error: (error as Error).message || 'Unknown error occurred',
    });
  }
}
