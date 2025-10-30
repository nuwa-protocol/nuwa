import { IncomingMessage, ServerResponse } from 'http';
import { downloadFromSupabase, queryCapStats as queryCapStatsFromSupabase } from '../supabase.js';
import { sendJson } from './utils.js';

/**
 * GET /api/cap/download/:id
 * Download Cap by ID
 */
export async function handleDownloadCap(
  req: IncomingMessage,
  res: ServerResponse,
  capId: string
): Promise<void> {
  try {
    // RESTful API doesn't require user authentication for stats
    const result = await downloadFromSupabase(capId);

    if (!result.success) {
      sendJson(res, 404, {
        code: 404,
        error: result.error || 'No matching records found',
      });
      return;
    }

    sendJson(res, 200, {
      code: 200,
      data: result.data,
    });
  } catch (error) {
    sendJson(res, 500, {
      code: 500,
      error: (error as Error).message || 'Unknown error occurred',
    });
  }
}
