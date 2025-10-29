import { IncomingMessage, ServerResponse } from 'http';
import { sendJson, sendCorsResponse } from './utils.js';
import { handleQueryCaps } from './query-caps.js';
import { handleQueryCapById } from './query-cap-by-id.js';
import { handleQueryCapStats } from './query-cap-stats.js';
// import { handleDownloadCap } from './download-cap.js';

/**
 * Main RESTful API route handler
 * Routes all /api/* requests to appropriate handlers
 * 
 * @returns true if the request was handled, false otherwise
 */
export async function handleApiRoutes(
  req: IncomingMessage,
  res: ServerResponse
): Promise<boolean> {
  const url = new URL(req.url || '', 'http://localhost');
  const pathname = url.pathname;

  // Only handle /api routes
  if (!pathname.startsWith('/api')) {
    return false;
  }

  // Handle OPTIONS for CORS preflight
  if (req.method === 'OPTIONS') {
    sendCorsResponse(res);
    return true;
  }

  try {
    // Route: GET /api/caps/download/:id
    // Download cap by ID
    // if (req.method === 'GET' && pathname.match(/^\/api\/caps\/download\/[^\/]+$/)) {
    //   const parts = pathname.split('/');
    //   const id = parts[parts.length - 1];
    //   if (id) {
    //     await handleDownloadCap(req, res, id);
    //     return true;
    //   }
    // }

    // Route: GET /api/caps/stats/:id
    // Get statistics for a specific cap
    if (req.method === 'GET' && pathname.match(/^\/api\/caps\/stats\/[^\/]+$/)) {
      const parts = pathname.split('/');
      const capId = parts[parts.length - 2];
      if (capId) {
        await handleQueryCapStats(req, res, capId);
        return true;
      }
    }

    // // Route: GET /api/caps/cid/:cid
    // // Must be checked before /api/caps/:id to avoid conflicts
    // if (req.method === 'GET' && pathname.match(/^\/api\/caps\/cid\/[^\/]+$/)) {
    //   const cid = pathname.split('/').pop();
    //   if (cid) {
    //     await handleQueryCapByCid(req, res, cid);
    //     return true;
    //   }
    // }

    // Route: GET /api/caps/:id
    if (req.method === 'GET' && pathname.match(/^\/api\/caps\/[^\/]+$/) && !pathname.includes('/cid/') && !pathname.includes('/stats') && !pathname.includes('/download')) {
      const id = pathname.split('/').pop();
      if (id) {
        await handleQueryCapById(req, res, id);
        return true;
      }
    }

    // Route: GET /api/caps
    if (req.method === 'GET' && pathname === '/api/caps') {
      await handleQueryCaps(req, res);
      return true;
    }

    // No matching route found
    sendJson(res, 404, {
      code: 404,
      error: 'API route not found',
    });
    return true;
  } catch (error) {
    sendJson(res, 500, {
      code: 500,
      error: (error as Error).message || 'Unknown error occurred',
    });
    return true;
  }
}

