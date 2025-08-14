## Client Transaction Store Design (HTTP-first, MCP-ready)

### Goals

- Record each client-side request as a transaction for UI display and auditing.
- Include both request essentials and a normalized payment snapshot (`PaymentSnapshot`).
- Keep it protocol-agnostic (HTTP today, MCP later) and privacy-friendly by default.

---

### Record Model

Transaction records are keyed by `clientTxRef` (the protocol correlation id). This aligns logs across client, server, and protocol errors. To avoid field duplication with outer metadata, we store a normalized `PaymentSnapshot` instead of the full `PaymentInfo`.

```ts
export type TransactionStatus = 'pending' | 'free' | 'paid' | 'error';

// Normalized payment snapshot to avoid duplication with outer fields
export interface PaymentSnapshot {
  cost: bigint;
  costUsd: bigint;
  nonce: bigint;
  serviceTxRef?: string;
  paidAt: string; // ISO8601 time when payment was resolved
}

export interface TransactionRecord {
  // Identity & correlation (use clientTxRef as the unique id)
  clientTxRef: string; // Correlation id (serves as the record id)
  timestamp: number; // Created at (ms)

  // Request side (protocol-agnostic)
  protocol: 'http' | 'mcp' | 'other';
  method?: 'GET' | 'POST' | 'PUT' | 'DELETE' | 'PATCH'; // HTTP only
  urlOrTarget: string; // HTTP: URL; MCP: server URL or method name
  operation?: string; // e.g. POST:/chat/completions, or MCP method
  headersSummary?: Record<string, string>; // Whitelisted headers
  requestBodyHash?: string; // Optional: hash instead of storing raw body
  stream: boolean; // Whether this request is streaming

  // Channel & payment
  channelId?: string;
  vmIdFragment?: string; // Sub-channel verification method fragment
  assetId?: string;
  payment?: PaymentSnapshot; // normalized snapshot

  // Response
  statusCode?: number;
  durationMs?: number; // From send to headers/first frame

  // State
  status: TransactionStatus;
  errorMessage?: string;
  errorCode?: string; // Protocol/HTTP error codes

  // Extensibility
  meta?: Record<string, any>;
}
```

Notes:

- Privacy by default: do not store raw request bodies; use `requestBodyHash` (and size if needed). Store only whitelisted headers (e.g., `content-type`, `x-client-tx-ref`).
- If you need retries/attempt history for a single `clientTxRef`, add `attempt` counters or maintain an `attempts[]` array in `meta`.
- Do not duplicate fields already present at the record level (e.g., `clientTxRef`, `channelId`, `assetId`). Keep `serviceTxRef` only inside `payment`.
- Consider indexing `vmIdFragment` (optionally with `channelId`) for multi-device/sub-channel filtering.

---

### Store Abstraction

```ts
export interface TransactionStore {
  create(record: TransactionRecord): Promise<void>;
  update(clientTxRef: string, updates: Partial<TransactionRecord>): Promise<void>;
  get(clientTxRef: string): Promise<TransactionRecord | null>;
  list(
    filter?: {
      status?: TransactionStatus;
      channelId?: string;
      protocol?: 'http' | 'mcp' | 'other';
      since?: number; // ms
      until?: number; // ms
    },
    pagination?: { offset?: number; limit?: number }
  ): Promise<{ items: TransactionRecord[]; total: number; hasMore: boolean }>;
  clear(): Promise<void>;
  subscribe?(
    cb: (event: { type: 'created' | 'updated'; record: TransactionRecord }) => void
  ): () => void;
}
```

#### Default Implementations (Client-side)

- Memory store: fast, bounded size (e.g., `maxRecords = 500`).
- IndexedDB store: persisted across sessions, with indices on `clientTxRef`, `timestamp`, `channelId`, `status`.

Recommended layout:

- `src/storage/interfaces/TransactionStore.ts`
- `src/storage/memory/transaction.memory.ts`
- `src/storage/indexeddb/transactions.indexeddb.ts`
- `src/storage/factories/createTransactionStore.ts`
- Re-export via `src/storage/index.ts`

---

### Client Integration Points (HTTP)

Integrate the store in `PaymentChannelHttpClient` with minimal hooks:

1. At request creation (`createRequestHandle`):

```ts
store.create({
  clientTxRef,
  timestamp: Date.now(),
  protocol: 'http',
  method,
  urlOrTarget: fullUrl,
  operation: `${method}:${new URL(fullUrl).pathname}`,
  headersSummary: pickWhitelistedHeaders(headers),
  requestBodyHash: hashBody(init?.body),
  stream: isStreamHint(init),
  channelId: this.getChannelId(),
  vmIdFragment: sentedSubRav?.subRav?.vmIdFragment, // if available
  assetId: defaultAssetId,
  status: 'pending',
});
```

2. On response headers (or stream detection):

```ts
// when headers are available
store.update(clientTxRef, {
  statusCode: response.status,
  durationMs: Date.now() - startTs,
  // mark free if no protocol header and non-stream
});
```

3. On protocol success (header or in-band frame): normalize and store snapshot

```ts
const snapshot: PaymentSnapshot = {
  cost: paymentInfo.cost,
  costUsd: paymentInfo.costUsd,
  nonce: paymentInfo.nonce,
  serviceTxRef: paymentInfo.serviceTxRef,
  paidAt: paymentInfo.timestamp,
};

store.update(clientTxRef, { payment: snapshot, status: 'paid' });

// Also backfill vmIdFragment from response payload if not set
if (!existing.vmIdFragment && proto.subRav?.vmIdFragment) {
  store.update(clientTxRef, { vmIdFragment: proto.subRav.vmIdFragment });
}
```

4. On protocol error/request failure:

```ts
store.update(clientTxRef, {
  status: 'error',
  errorCode: paymentError.code,
  errorMessage: paymentError.message,
});
```

These hooks naturally cover both non-streaming (headers) and streaming (in-band frames) flows.

---

### Public API (HTTP Client)

Expose the store for UI access:

```ts
getTransactionStore(): TransactionStore;

// Optional helpers
async listTransactions(filter?, pagination?) { return store.list(filter, pagination); }
async getTransaction(clientTxRef: string) { return store.get(clientTxRef); }
subscribeTransactions(cb) { return store.subscribe?.(cb) ?? (() => {}); }
```

Options injection (`HttpPayerOptions`):

```ts
export interface HttpPayerOptions {
  // ...existing
  transactionStore?: TransactionStore;
  transactionLog?: {
    enabled?: boolean; // default: true
    persist?: 'memory' | 'indexeddb' | 'custom';
    maxRecords?: number; // for memory store
    sanitizeRequest?: (
      headers: Record<string, string>,
      body?: any
    ) => {
      headersSummary?: Record<string, string>;
      requestBodyHash?: string;
    };
  };
}
```

When not provided, create a default memory store (bounded) or IndexedDB store in browser contexts.

---

### Privacy & Compliance

- Do not persist raw request bodies by default. Store a hash/size only.
- Keep a header whitelist (`content-type`, `x-client-tx-ref`, etc.). Mask or drop sensitive headers.
- Provide `sanitizeRequest` callback for advanced policies.

---

### MCP Readiness

The same store abstraction applies to MCP clients:

- `protocol = 'mcp'`
- `urlOrTarget = serverUrl`
- `operation = method` (e.g., `prompts/get`)
- Hook the same lifecycle points (request created, result, error). For streaming MCP transports, reuse stream detection or event callbacks to finalize payment.

---

### UI Suggestions

- Default sort: `timestamp desc`.
- Columns: time, method/operation, path/target, status, cost (asset/USD), nonce, `serviceTxRef`, error.
- Details: headers summary, body hash/size, `channelId`, `assetId`, `clientTxRef`.

---

### Implementation Notes

- Keep transaction store separate from `ChannelRepository` / `RAVRepository` to avoid coupling; reuse the same factory and pagination patterns for consistency.
- For IndexedDB, use a dedicated object store `transactions` and add indices: `by_clientTxRef`, `by_timestamp`, `by_channelId`, `by_status`.
- For performance, batch updates where applicable and debounce UI notifications via `subscribe`.

---

### Minimal Example (HTTP)

```ts
const http = await createHttpClient({ baseUrl, env, transactionLog: { persist: 'indexeddb' } });

// Make a request
const { data } = await http.requestAndWaitForPayment('GET', '/echo?q=hello');

// List last 50 transactions
const txStore = http.getTransactionStore();
const { items } = await txStore.list({}, { offset: 0, limit: 50 });

// Subscribe to updates
const un = txStore.subscribe?.(e => console.log('tx event', e));
```

This design provides a consistent, privacy-aware transaction log suitable for client UIs and extensible to future MCP clients.
