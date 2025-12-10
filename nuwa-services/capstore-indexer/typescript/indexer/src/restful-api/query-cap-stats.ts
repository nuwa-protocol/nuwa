import { IncomingMessage, ServerResponse } from 'http';
import { queryCapStats as queryCapStatsFromSupabase } from '../supabase.js';
import { sendJson } from './utils.js';

/**
 * GET /api/caps/:id/stats
 * Query cap statistics by ID
 */
export async function handleQueryCapStats(
  req: IncomingMessage,
  res: ServerResponse,
  capId: string
): Promise<void> {
  try {
    // RESTful API doesn't require user authentication for stats
    const result = await queryCapStatsFromSupabase(capId);

    if (!result.success) {
      sendJson(res, 404, {
        code: 404,
        error: result.error || 'No matching records found',
      });
      return;
    }

    sendJson(res, 200, {
      code: 200,
      data: result.stats,
    });
  } catch (error) {
    sendJson(res, 500, {
      code: 500,
      error: (error as Error).message || 'Unknown error occurred',
    });
  }
}
