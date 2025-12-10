/**
 * MCP Resource for UI rendering via path
 * The client will use the path to construct the full URL with its known origin
 */
export interface UIResource {
  type: 'resource';
  resource: {
    uri: string;
    name?: string;
    description?: string;
    mimeType: 'text/x-nuwa-cap-ui-url';
    text: string;
  };
}

export interface CreateUIResourceOptions {
  url: string;
  name?: string;
  description?: string;
}

/**
 * Helper function to create a UI resource
 */
export function createUIResource(options: CreateUIResourceOptions): UIResource {
  return {
    type: 'resource',
    resource: {
      uri: `nuwacapui://${options.name || ''}`,
      name: options.name || '',
      description: options.description || '',
      mimeType: 'text/x-nuwa-cap-ui-url',
      text: options.url,
    },
  };
}

/**
 * Type guard to check if a given value is a UIResource content item
 */
export function isUIResource(res: any): res is UIResource {
  if (!res || typeof res !== 'object') return false;
  // Must be a MCP content item with type "resource"
  if (res.type !== 'resource') return false;
  const r = (res as any).resource;
  if (!r || typeof r !== 'object') return false;

  // Required fields
  if (typeof r.uri !== 'string') return false;
  if (typeof r.text !== 'string') return false;
  if (typeof r.mimeType !== 'string') return false;

  // Accept the current MIME as canonical; allow legacy variant for forward-compat
  const allowedMimes = ['text/x-nuwa-cap-ui-url'];
  if (!allowedMimes.includes(r.mimeType)) return false;

  // Optional description must be string if present
  if ('description' in r && r.description != null && typeof r.description !== 'string') {
    return false;
  }

  return true;
}
