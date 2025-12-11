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
    console.log('[API:queryCapById] Query started:', {
      id,
      timestamp: new Date().toISOString(),
    });
    
    const result = await queryFromSupabase(id, null, null);

    if (!result.success || !result.items || result.items.length === 0) {
      console.warn('[API:queryCapById] No matching records found:', {
        id,
        error: result.error,
        timestamp: new Date().toISOString(),
      });
      
      sendJson(res, 404, {
        code: 404,
        error: result.error || 'No matching records found',
      });
      return;
    }

    console.log('[API:queryCapById] Query successful:', {
      id,
      itemId: result.items[0].id,
      timestamp: new Date().toISOString(),
    });
    
    sendJson(res, 200, {
      code: 200,
      data: result.items[0],
    });
  } catch (error) {
    console.error('[API:queryCapById] Query failed:', {
      id,
      error: error instanceof Error ? error.message : String(error),
      stack: error instanceof Error ? error.stack : undefined,
      timestamp: new Date().toISOString(),
    });
    
    sendJson(res, 500, {
      code: 500,
      error: (error as Error).message || 'Unknown error occurred',
    });
  }
}
