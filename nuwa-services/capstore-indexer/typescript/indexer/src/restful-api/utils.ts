import { IncomingMessage, ServerResponse } from 'http';

/**
 * Parse JSON body from request
 */
export async function parseJsonBody(req: IncomingMessage): Promise<any> {
  return new Promise((resolve, reject) => {
    let body = '';
    req.on('data', chunk => {
      body += chunk.toString();
    });
    req.on('end', () => {
      try {
        resolve(body ? JSON.parse(body) : {});
      } catch (e) {
        reject(new Error('Invalid JSON'));
      }
    });
    req.on('error', reject);
  });
}

/**
 * Parse query parameters from URL
 */
export function parseQueryParams(url: string): Record<string, string | string[]> {
  const urlObj = new URL(url, 'http://localhost');
  const params: Record<string, string | string[]> = {};

  for (const [key, value] of urlObj.searchParams.entries()) {
    if (params[key]) {
      if (Array.isArray(params[key])) {
        (params[key] as string[]).push(value);
      } else {
        params[key] = [params[key] as string, value];
      }
    } else {
      params[key] = value;
    }
  }

  return params;
}

/**
 * Send JSON response with CORS headers
 */
export function sendJson(res: ServerResponse, statusCode: number, data: any): void {
  res.writeHead(statusCode, {
    'Content-Type': 'application/json',
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type',
  });
  res.end(JSON.stringify(data));
}

/**
 * Send CORS preflight response
 */
export function sendCorsResponse(res: ServerResponse): void {
  res.writeHead(204, {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type',
  });
  res.end();
}

/**
 * Extract path parameter from URL
 * @param pathname - URL pathname
 * @param pattern - Pattern to match (e.g., '/api/caps/:id')
 * @returns The extracted parameter or null
 */
export function extractPathParam(pathname: string, pattern: string): string | null {
  const parts = pathname.split('/');
  const patternParts = pattern.split('/');

  if (parts.length !== patternParts.length) {
    return null;
  }

  for (let i = 0; i < patternParts.length; i++) {
    if (patternParts[i].startsWith(':')) {
      return parts[i];
    } else if (parts[i] !== patternParts[i]) {
      return null;
    }
  }

  return null;
}

/**
 * Check if pathname matches pattern
 */
export function matchesPattern(pathname: string, pattern: RegExp): boolean {
  return pattern.test(pathname);
}
