import { useState, useEffect } from 'react';
import { getGatewayUrl, setGatewayUrl, getMcpUrl, setMcpUrl } from '../services/GatewayDebug';
import { useAuth } from '../App';
import { requestWithPayment, requestWithPaymentRaw, resetPaymentClient, getPaymentClient, getMcpClient } from '../services/PaymentClient';
import { formatUsdAmount } from '@nuwa-ai/payment-kit';

export function GatewayDebugPanel() {
  const { sdk } = useAuth();
  const [activeTab, setActiveTab] = useState<'http' | 'mcp'>('http');
  const [gatewayUrl, setGatewayUrlState] = useState(getGatewayUrl());
  const [mcpUrl, setMcpUrlState] = useState(getMcpUrl());
  const [method, setMethod] = useState<'GET' | 'POST' | 'PUT' | 'DELETE'>('POST');
  const [apiPath, setApiPath] = useState('/api/v1/chat/completions');
  const [provider, setProvider] = useState<'openrouter' | 'litellm'>('openrouter');
  const [isStream, setIsStream] = useState<boolean>(false);
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
  const [payment, setPayment] = useState<any | null>(null);
  const [paymentNote, setPaymentNote] = useState<string | null>(null);
  // MCP specific
  const [mcpConnected, setMcpConnected] = useState(false);
  const [mcpTools, setMcpTools] = useState<Array<{ name: string; description?: string; inputSchema?: any }>>([]);
  const [mcpTool, setMcpTool] = useState('');
  const [mcpSchema, setMcpSchema] = useState<any | null>(null);
  const [mcpUseRaw, setMcpUseRaw] = useState(false);
  const [mcpParams, setMcpParams] = useState<string>('{}');
  const [mcpFormValues, setMcpFormValues] = useState<Record<string, any>>({});

  // Transaction history state
  const [txItems, setTxItems] = useState<any[]>([]);
  const [txLoading, setTxLoading] = useState(false);
  const [txError, setTxError] = useState<string | null>(null);
  const [liveSubscribe, setLiveSubscribe] = useState<boolean>(true);

  const handleSaveGateway = () => {
    setGatewayUrl(gatewayUrl);
    resetPaymentClient(gatewayUrl); // reset per-host client when base URL changes
  };

  const handleSaveMcp = () => {
    setMcpUrl(mcpUrl);
    resetPaymentClient(mcpUrl); // reset per-host MCP client when base URL changes
    setMcpConnected(false);
    setMcpTools([]);
    setMcpTool('');
    setMcpSchema(null);
    setMcpFormValues({});
  };
  const handleMcpConnect = async () => {
    if (!sdk) return setError('SDK not initialized');
    try {
      setLoading(true);
      setError(null);
      const client = await getMcpClient(sdk, mcpUrl, gatewayUrl);
      const tools = await client.listTools({
        includeBuiltinTools: true,
      });
      // Normalize tools into array (supports various SDK/result shapes)
      let list: Array<{ name: string; description?: string; inputSchema?: any }> = [];
      const normalize = (t: any) => ({
        name: t?.name || '',
        description: t?.description,
        inputSchema: t?.inputSchema || t?.parameters || t?.input_schema || null,
      });
      if (tools && Array.isArray((tools as any).tools)) {
        list = (tools as any).tools.map(normalize);
      } else if (Array.isArray(tools)) {
        list = (tools as any).map(normalize);
      } else if (tools && typeof tools === 'object') {
        // Some servers return a map: { [name]: { description, inputSchema } }
        list = Object.entries(tools as Record<string, any>).map(([name, v]) => normalize({ name, ...v }));
      }
      setMcpTools(list);
      if (list.length > 0) {
        setMcpTool(list[0].name);
        setMcpSchema(list[0].inputSchema || null);
        initFormFromSchema(list[0].inputSchema || null);
      }
      setMcpConnected(true);
    } catch (e: any) {
      setError(e?.message || String(e));
    } finally {
      setLoading(false);
    }
  };

  function initFormFromSchema(schema: any | null) {
    if (!schema || typeof schema !== 'object') {
      setMcpFormValues({});
      return;
    }
    const props = (schema as any).properties || {};
    const initial: Record<string, any> = {};
    for (const key of Object.keys(props)) {
      const p = props[key] || {};
      if (p.default !== undefined) initial[key] = p.default;
      else if (Array.isArray(p.enum) && p.enum.length > 0) initial[key] = p.enum[0];
      else if (p.type === 'string') initial[key] = '';
      else if (p.type === 'number' || p.type === 'integer') initial[key] = 0;
      else if (p.type === 'boolean') initial[key] = false;
      else initial[key] = '';
    }
    setMcpFormValues(initial);
  }

  function renderFormFromSchema() {
    if (!mcpSchema || !mcpSchema.properties || typeof mcpSchema.properties !== 'object') return null;
    const entries = Object.entries<any>(mcpSchema.properties);
    return (
      <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
        {entries.map(([key, prop]) => {
          const title = prop?.title || key;
          const type = prop?.type;
          const enumVals: any[] | undefined = Array.isArray(prop?.enum) ? prop.enum : undefined;
          const help = prop?.description as string | undefined;
          const value = mcpFormValues[key];
          const setVal = (v: any) => setMcpFormValues(prev => ({ ...prev, [key]: v }));
          return (
            <div key={key} style={{ textAlign: 'left' }}>
              <label style={{ display: 'block', fontWeight: 600 }}>{title}</label>
              {enumVals ? (
                <select value={value ?? ''} onChange={e => setVal(e.target.value)}>
                  {enumVals.map(opt => (
                    <option key={String(opt)} value={opt}>{String(opt)}</option>
                  ))}
                </select>
              ) : type === 'boolean' ? (
                <input type="checkbox" checked={!!value} onChange={e => setVal(e.target.checked)} />
              ) : type === 'number' || type === 'integer' ? (
                <input type="number" value={value ?? 0} onChange={e => setVal(e.target.value === '' ? '' : Number(e.target.value))} />
              ) : type === 'string' ? (
                <input type="text" value={value ?? ''} onChange={e => setVal(e.target.value)} />
              ) : (
                <textarea value={typeof value === 'string' ? value : JSON.stringify(value ?? '', null, 2)} onChange={e => setVal(e.target.value)} />
              )}
              {help && <div style={{ fontSize: 12, color: '#666' }}>{help}</div>}
            </div>
          );
        })}
      </div>
    );
  }

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

  const handleSend = async () => {
    try {
      setLoading(true);
      setError(null);
      setResponseText(null);
      const additionalHeaders: Record<string, string> = {};
      if (provider) {
        additionalHeaders['X-LLM-Provider'] = provider;
      }

      // Send via Payment Channel client using sdk
      if (!sdk) throw new Error('SDK not initialized');
      const parsedBody = method !== 'GET' && method !== 'DELETE' && requestBody ? JSON.parse(requestBody) : undefined;
      if (isStream) {
        const bodyWithStream = parsedBody ? { ...parsedBody, stream: true } : { stream: true };
        const handle = await requestWithPaymentRaw(sdk, gatewayUrl, 'POST', apiPath, bodyWithStream, additionalHeaders);
        const resp = await handle.response;
        if (!resp.body) throw new Error('No response body for stream');
        // Read full stream into text for debug panel (app-level would normally consume incrementally)
        const reader = (resp.body as any).getReader();
        const decoder = new TextDecoder();
        setResponseText('');
        while (true) {
          const { value, done } = await reader.read();
          if (done) break;
          if (value) {
            const chunkText = decoder.decode(value, { stream: true });
            if (chunkText) setResponseText(prev => ((prev || '') + chunkText));
          }
        }
        const tail = decoder.decode();
        if (tail) setResponseText(prev => ((prev || '') + tail));
        try {
          const paymentInfo = await handle.payment;
          if (paymentInfo) {
            setPayment(paymentInfo);
            setPaymentNote(null);
          } else {
            setPaymentNote('Streaming: payment not returned');
          }
        } catch {
          setPaymentNote('Streaming: payment failed to resolve');
        }
        // payment will be resolved asynchronously inside client via in-band frame; we cannot access it directly here
        
      } else {
        const { data, payment } = await requestWithPayment(sdk, gatewayUrl, method, apiPath, parsedBody, additionalHeaders);
        if (!payment) {
          setPaymentNote('No payment info from server.');
        } else {
          setPayment(payment);
        }
        setResponseText(formatResponse(data));
      }

      // non-stream path already set responseText above
      await refreshTransactions();
    } catch (e: any) {
      setError(e.message || String(e));
    } finally {
      setLoading(false);
    }
  };

  const handleMcpSend = async () => {
    try {
      setLoading(true);
      setError(null);
      setResponseText(null);
      setPayment(null);
      setPaymentNote(null);
      if (!sdk) throw new Error('SDK not initialized');
      let parsedParams: any = undefined;
      if (mcpUseRaw) {
        parsedParams = mcpParams && mcpParams.trim().length > 0 ? JSON.parse(mcpParams) : undefined;
      } else if (mcpSchema && mcpSchema.properties) {
        // Coerce simple textarea JSON values if user typed JSON in complex fields
        const out: Record<string, any> = {};
        for (const [k, v] of Object.entries(mcpFormValues)) {
          const prop = mcpSchema.properties[k];
          if (typeof v === 'string' && prop && (!prop.type || prop.type === 'object' || prop.type === 'array')) {
            try { out[k] = JSON.parse(v); } catch { out[k] = v; }
          } else {
            out[k] = v;
          }
        }
        parsedParams = out;
      }
      const client = await getMcpClient(sdk, mcpUrl, gatewayUrl);
      const toolName = mcpTool || 'nuwa.health';
      const { content, payment } = await client.callToolWithPayment(toolName, parsedParams);
      if (payment) setPayment(payment); else setPaymentNote('No payment info from MCP server.');
      setResponseText(formatResponse(content));
      await refreshTransactions();
    } catch (e: any) {
      setError(e.message || String(e));
    } finally {
      setLoading(false);
    }
  };

  async function refreshTransactions() {
    if (!sdk) return;
    try {
      setTxLoading(true);
      setTxError(null);
      const client = await getPaymentClient(sdk, gatewayUrl);
      const store = client.getTransactionStore();
      const { items } = await store.list({}, { limit: 100 });
      const sorted = [...items].sort((a, b) => b.timestamp - a.timestamp);
      setTxItems(sorted);
    } catch (e: any) {
      console.error('Error sending request:', e);
      setTxError(e.message || String(e));
    } finally {
      setTxLoading(false);
    }
  }

  useEffect(() => {
    refreshTransactions();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [sdk, gatewayUrl]);

  useEffect(() => {
    if (!liveSubscribe || !sdk) return;
    let unsub: (() => void) | undefined;
    (async () => {
      try {
        const client = await getPaymentClient(sdk, gatewayUrl);
        const store = client.getTransactionStore();
        if (store.subscribe) {
          unsub = store.subscribe(evt => {
            setTxItems(prev => {
              const next = [...prev];
              const idx = next.findIndex(r => r.clientTxRef === evt.record.clientTxRef);
              if (idx >= 0) next[idx] = evt.record; else next.unshift(evt.record);
              return next.slice(0, 100);
            });
          });
        }
      } catch {}
    })();
    return () => {
      try {
        if (unsub) unsub();
      } catch {}
    };
  }, [sdk, gatewayUrl, liveSubscribe]);

  return (
    <div className="gateway-container">
      <h2>LLM Gateway & MCP Debug</h2>
      {/* Tabs */}
      <div style={{ marginBottom: '12px' }}>
        <button onClick={() => setActiveTab('http')} disabled={activeTab === 'http'} style={{ marginRight: 8 }}>HTTP</button>
        <button onClick={() => setActiveTab('mcp')} disabled={activeTab === 'mcp'}>MCP</button>
      </div>

      {activeTab === 'http' && (
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
      )}

      {activeTab === 'mcp' && (
        <div className="gateway-settings" style={{ marginBottom: '1rem' }}>
          <label style={{ marginRight: '8px' }}>MCP URL:</label>
          <input
            type="text"
            value={mcpUrl}
            onChange={e => setMcpUrlState(e.target.value)}
            style={{ width: '60%' }}
          />
          <button onClick={handleSaveMcp} style={{ marginLeft: '8px' }}>
            Save
          </button>
        </div>
      )}

      {activeTab === 'http' && (
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
      )}

      {activeTab === 'http' && (
      <div className="provider-select" style={{ marginBottom: '1rem' }}>
        <label style={{ marginRight: '8px' }}>Provider:</label>
        <select value={provider} onChange={e => setProvider(e.target.value as any)}>
          <option value="openrouter">openrouter</option>
          <option value="litellm">litellm</option>
        </select>
        <small style={{ marginLeft: '8px' }}>(adds X-LLM-Provider header)</small>
      </div>
      )}

      {activeTab === 'http' && (
        <div className="stream-toggle" style={{ marginBottom: '1rem' }}>
          <label>
            <input
              type="checkbox"
              checked={isStream}
              onChange={e => setIsStream(e.target.checked)}
              style={{ marginRight: '6px' }}
            />
            Stream (SSE)
          </label>
          <small style={{ marginLeft: '8px' }}>(adds stream: true in body; reads Response stream)</small>
        </div>
      )}

      {activeTab === 'http' && method !== 'GET' && method !== 'DELETE' && (
        <textarea
          style={{ width: '100%', height: '160px' }}
          value={requestBody}
          onChange={e => setRequestBody(e.target.value)}
        />
      )}

      {activeTab === 'http' && (
        <button onClick={handleSend} disabled={loading} style={{ marginTop: '12px' }}>
          {loading ? 'Sending...' : 'Send'}
        </button>
      )}

      {activeTab === 'mcp' && (
        <div className="mcp-request" style={{ marginBottom: '1rem', textAlign: 'left' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 8 }}>
            <button onClick={handleMcpConnect} disabled={loading || mcpConnected}>{mcpConnected ? 'Connected' : 'Connect'}</button>
            {mcpConnected && <small>Connected</small>}
          </div>
          <div style={{ marginBottom: 8 }}>
            <label style={{ marginRight: 8 }}>Tool:</label>
            <select value={mcpTool} onChange={e => {
              const name = e.target.value; setMcpTool(name);
              const t = mcpTools.find(it => it.name === name);
              const schema = t?.inputSchema || null; setMcpSchema(schema); initFormFromSchema(schema);
            }} style={{ minWidth: 260 }}>
              <option value="" disabled>Select a tool</option>
              {mcpTools.map(t => (
                <option key={t.name} value={t.name}>{t.name}</option>
              ))}
            </select>
          </div>
          {mcpTool && (
            <div style={{ marginBottom: 8, color: '#666' }}>
              {mcpTools.find(t => t.name === mcpTool)?.description || ''}
            </div>
          )}
          <div style={{ marginBottom: 8 }}>
            <label>
              <input type="checkbox" checked={mcpUseRaw} onChange={e => setMcpUseRaw(e.target.checked)} style={{ marginRight: 6 }} />
              Use raw JSON params
            </label>
          </div>
          {mcpUseRaw ? (
            <textarea style={{ width: '100%', height: '160px' }} value={mcpParams} onChange={e => setMcpParams(e.target.value)} />
          ) : (
            <div>{renderFormFromSchema()}</div>
          )}
          <button onClick={handleMcpSend} disabled={loading || !mcpTool} style={{ marginTop: '12px' }}>
            {loading ? 'Calling...' : 'Call Tool'}
          </button>
        </div>
      )}

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

      {paymentNote && (
        <div style={{ marginTop: '0.5rem', color: '#555' }}>{paymentNote}</div>
      )}

      {payment && (
        <div style={{ marginTop: '1rem' }}>
          <h3>Payment</h3>
          <table style={{ width: '100%', borderCollapse: 'collapse' }}>
            <tbody>
              <tr>
                <td style={{ width: 160, fontWeight: 600 }}>Channel ID</td>
                <td>{payment.channelId}</td>
              </tr>
              <tr>
                <td style={{ fontWeight: 600 }}>Asset</td>
                <td>{payment.assetId}</td>
              </tr>
              <tr>
                <td style={{ fontWeight: 600 }}>Nonce</td>
                <td>{String(payment.nonce ?? '')}</td>
              </tr>
              <tr>
                <td style={{ fontWeight: 600 }}>Cost (asset units)</td>
                <td>{String(payment.cost ?? '')}</td>
              </tr>
              <tr>
                <td style={{ fontWeight: 600 }}>Cost (USD)</td>
                <td>{formatUsdAmount(payment.costUsd)}</td>
              </tr>
              <tr>
                <td style={{ fontWeight: 600 }}>Tx Ref (client)</td>
                <td>{payment.clientTxRef}</td>
              </tr>
              <tr>
                <td style={{ fontWeight: 600 }}>Tx Ref (service)</td>
                <td>{payment.serviceTxRef ?? ''}</td>
              </tr>
              <tr>
                <td style={{ fontWeight: 600 }}>Timestamp</td>
                <td>{payment.timestamp}</td>
              </tr>
            </tbody>
          </table>
        </div>
      )}

      {/* Transaction history */}
      <div style={{ marginTop: '2rem' }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
          <h3>Transaction History</h3>
          <div>
            <label style={{ marginRight: 12 }}>
              <input
                type="checkbox"
                checked={liveSubscribe}
                onChange={e => setLiveSubscribe(e.target.checked)}
                style={{ marginRight: 6 }}
              />
              Live
            </label>
            <button onClick={refreshTransactions} disabled={txLoading}>Refresh</button>
          </div>
        </div>
        {txError && (
          <div style={{ color: 'red', marginTop: 8 }}>{txError}</div>
        )}
        <div style={{ marginTop: 8, maxHeight: 320, overflowY: 'auto', background: '#fafafa', border: '1px solid #eee' }}>
          <table style={{ width: '100%', borderCollapse: 'collapse' }}>
            <thead>
              <tr>
                <th style={{ textAlign: 'left', padding: '6px 8px' }}>Time</th>
                <th style={{ textAlign: 'left', padding: '6px 8px' }}>Method</th>
                <th style={{ textAlign: 'left', padding: '6px 8px' }}>Path</th>
                <th style={{ textAlign: 'left', padding: '6px 8px' }}>Operation</th>
                <th style={{ textAlign: 'right', padding: '6px 8px' }}>Status</th>
                <th style={{ textAlign: 'right', padding: '6px 8px' }}>Cost (USD)</th>
                <th style={{ textAlign: 'left', padding: '6px 8px' }}>State</th>
              </tr>
            </thead>
            <tbody>
              {txItems.map(rec => {
                const url = rec.urlOrTarget || '';
                let path = url;
                try { const u = new URL(url); path = u.pathname; } catch {}
                const paidUsd = rec.payment ? formatUsdAmount(rec.payment.costUsd) : '-';
                const time = new Date(rec.timestamp).toLocaleString();
                return (
                  <tr key={rec.clientTxRef} style={{ borderTop: '1px solid #eee' }}>
                    <td style={{ padding: '6px 8px', fontFamily: 'monospace' }}>{time}</td>
                    <td style={{ padding: '6px 8px' }}>{rec.method || '-'}</td>
                    <td style={{ padding: '6px 8px', fontFamily: 'monospace' }}>{path}</td>
                    <td style={{ padding: '6px 8px', fontFamily: 'monospace' }}>{rec.operation || '-'}</td>
                    <td style={{ padding: '6px 8px', textAlign: 'right' }}>{rec.statusCode ?? ''}</td>
                    <td style={{ padding: '6px 8px', textAlign: 'right' }}>{paidUsd}</td>
                    <td style={{ padding: '6px 8px' }}>{rec.status}</td>
                  </tr>
                );
              })}
              {txItems.length === 0 && !txLoading && (
                <tr>
                  <td colSpan={7} style={{ padding: '8px 10px', color: '#666' }}>No transactions yet.</td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
