import { IncomingMessage, ServerResponse } from 'http';
import { queryFromSupabase } from '../supabase.js';
import { sendJson } from './utils.js';

/**
 * GET /api/caps/cid/:cid
 * Query cap by CID (Content Identifier)
 */
export async function handleQueryCapByCid(
  req: IncomingMessage,
  res: ServerResponse,
  cid: string
): Promise<void> {
  try {
    const result = await queryFromSupabase(null, null, cid);

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

