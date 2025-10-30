import { IncomingMessage, ServerResponse } from 'http';
import { downloadFromSupabase } from '../supabase.js';
import { sendJson } from './utils.js';

/**
 * POST /api/caps/download
 * Download multiple Caps by IDs
 *
 * Request body: { ids: string[] }
 * Response: { code: 200, data: { [id: string]: any } }
 */
export async function handleDownloadCaps(
  req: IncomingMessage,
  res: ServerResponse
): Promise<void> {
  try {
    // Parse request body to get IDs array
    let body = '';
    req.on('data', chunk => {
      body += chunk.toString();
    });

    await new Promise<void>((resolve) => {
      req.on('end', () => resolve());
    });

    let ids: string[];
    try {
      const parsed = JSON.parse(body);
      if (!parsed.ids || !Array.isArray(parsed.ids)) {
        sendJson(res, 400, {
          code: 400,
          error: 'Invalid request body. Expected { ids: string[] }',
        });
        return;
      }
      ids = parsed.ids;
    } catch (error) {
      sendJson(res, 400, {
        code: 400,
        error: 'Invalid JSON in request body',
      });
      return;
    }

    if (ids.length === 0) {
      sendJson(res, 400, {
        code: 400,
        error: 'No IDs provided',
      });
      return;
    }

    // Download all caps in parallel
    const downloadPromises = ids.map(async (id) => {
      try {
        const result = await downloadFromSupabase(id);
        return {
          id,
          success: result.success,
          data: result.success ? result.data : null,
          error: result.error || null,
        };
      } catch (error) {
        return {
          id,
          success: false,
          data: null,
          error: (error as Error).message || 'Unknown error occurred',
        };
      }
    });

    const results = await Promise.all(downloadPromises);

    // Format response
    const successfulDownloads: { [id: string]: any } = {};
    const failedDownloads: { [id: string]: string } = {};

    results.forEach((result) => {
      if (result.success && result.data) {
        successfulDownloads[result.id] = result.data.raw_data;
      } else {
        failedDownloads[result.id] = result.error || 'Download failed';
      }
    });

    sendJson(res, 200, {
      code: 200,
      data: {
        successful: successfulDownloads,
        failed: failedDownloads,
        summary: {
          total: ids.length,
          successful: Object.keys(successfulDownloads).length,
          failed: Object.keys(failedDownloads).length,
        },
      },
    });
  } catch (error) {
    sendJson(res, 500, {
      code: 500,
      error: (error as Error).message || 'Unknown error occurred',
    });
  }
}
