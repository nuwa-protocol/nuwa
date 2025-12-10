import { IncomingMessage, ServerResponse } from 'http';
import { queryFromSupabase } from '../supabase.js';
import { sendJson } from './utils.js';

/**
 * GET /api/caps/:id
 * Query cap by ID
 */
export async function handleQueryCapById(
  req: IncomingMessage,
  res: ServerResponse,
  id: string
): Promise<void> {
  try {
    const result = await queryFromSupabase(id, null, null);

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
