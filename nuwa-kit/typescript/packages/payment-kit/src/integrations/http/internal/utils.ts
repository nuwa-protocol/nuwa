/**
 * Detect if a fetch Response should be treated as streaming for payment in-band parsing.
 * Strictly checks Content-Type to avoid false positives (e.g., chunked JSON).
 */
export function isStreamLikeResponse(response: Response): boolean {
  const ct = (response.headers.get('content-type') || '').toLowerCase();
  return ct.includes('text/event-stream') || ct.includes('application/x-ndjson');
}
