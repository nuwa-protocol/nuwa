import { useState } from 'react';
import { getGatewayUrl, setGatewayUrl, sendSignedRequest } from '../services/GatewayDebug';
import { useAuth } from '../App';

export function GatewayDebugPanel() {
  const { sign } = useAuth();
  const [gatewayUrl, setGatewayUrlState] = useState(getGatewayUrl());
  const [method, setMethod] = useState<'GET' | 'POST' | 'PUT' | 'DELETE'>('POST');
  const [apiPath, setApiPath] = useState('/api/v1/chat/completions');
  const [provider, setProvider] = useState<'openrouter' | 'litellm'>('openrouter');
  const [requestBody, setRequestBody] = useState(`{
    "model": "deepseek/deepseek-r1-0528:free",
    "messages": [
      { "role": "system", "content": "You are a helpful assistant." },
      { "role": "user", "content": "Hello, who are you?" }
    ]
  }`);
  const [responseText, setResponseText] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleSaveGateway = () => {
    setGatewayUrl(gatewayUrl);
  };

  const handleSend = async () => {
    try {
      setLoading(true);
      setError(null);
      setResponseText(null);
      const additionalHeaders: Record<string, string> = {};
      if (provider) {
        additionalHeaders['X-LLM-Provider'] = provider;
      }

      const res = await sendSignedRequest(
        gatewayUrl,
        { method, path: apiPath, body: requestBody, headers: additionalHeaders },
        sign
      );

      // Helper: pretty-print response and parse nested JSON in `body` field if present
      const formatResponse = (response: any): string => {
        const parseIfJsonString = (value: any) => {
          if (typeof value !== 'string') return value;
          const trimmed = value.trim();
          if (
            (trimmed.startsWith('{') && trimmed.endsWith('}')) ||
            (trimmed.startsWith('[') && trimmed.endsWith(']'))
          ) {
            try {
              return JSON.parse(trimmed);
            } catch {
              return value; // fallback to original string if parse fails
            }
          }
          return value;
        };

        // Deep copy and transform
        const transform = (obj: any): any => {
          if (obj && typeof obj === 'object') {
            if (Array.isArray(obj)) {
              return obj.map(transform);
            }
            const newObj: Record<string, any> = {};
            for (const key in obj) {
              const val = obj[key];
              newObj[key] = transform(parseIfJsonString(val));
            }
            return newObj;
          }
          return obj;
        };

        try {
          const transformed = transform(response);
          return JSON.stringify(transformed, null, 2);
        } catch {
          return JSON.stringify(response, null, 2);
        }
      };

      setResponseText(formatResponse(res));
    } catch (e: any) {
      setError(e.message || String(e));
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="gateway-container">
      <h2>LLM Gateway Debug</h2>
      <div className="gateway-settings" style={{ marginBottom: '1rem' }}>
        <label style={{ marginRight: '8px' }}>Gateway URL:</label>
        <input
          type="text"
          value={gatewayUrl}
          onChange={e => setGatewayUrlState(e.target.value)}
          style={{ width: '60%' }}
        />
        <button onClick={handleSaveGateway} style={{ marginLeft: '8px' }}>
          Save
        </button>
      </div>

      <div className="gateway-request" style={{ marginBottom: '1rem' }}>
        <select value={method} onChange={e => setMethod(e.target.value as any)}>
          <option value="GET">GET</option>
          <option value="POST">POST</option>
          <option value="PUT">PUT</option>
          <option value="DELETE">DELETE</option>
        </select>
        <input
          type="text"
          value={apiPath}
          onChange={e => setApiPath(e.target.value)}
          style={{ width: '70%', marginLeft: '8px' }}
        />
      </div>

      <div className="provider-select" style={{ marginBottom: '1rem' }}>
        <label style={{ marginRight: '8px' }}>Provider:</label>
        <select value={provider} onChange={e => setProvider(e.target.value as any)}>
          <option value="openrouter">openrouter</option>
          <option value="litellm">litellm</option>
        </select>
        <small style={{ marginLeft: '8px' }}>(adds X-LLM-Provider header)</small>
      </div>

      {method !== 'GET' && method !== 'DELETE' && (
        <textarea
          style={{ width: '100%', height: '160px' }}
          value={requestBody}
          onChange={e => setRequestBody(e.target.value)}
        />
      )}

      <button onClick={handleSend} disabled={loading} style={{ marginTop: '12px' }}>
        {loading ? 'Sending...' : 'Send'}
      </button>

      {error && (
        <pre style={{ color: 'red', marginTop: '1rem', whiteSpace: 'pre-wrap' }}>{error}</pre>
      )}

      {responseText && (
        <pre
          style={{ marginTop: '1rem', background: '#f5f5f5', padding: '1rem', overflowX: 'auto' }}
        >
          {responseText}
        </pre>
      )}
    </div>
  );
}
