## MCP Client: State and Channel Lifecycle Design

### Goals

- Unify discovery, recovery, authorization, commit, and info query flows for the MCP client.
- Reuse the proven HTTP client architecture (PaymentState + ChannelManager) while abstracting transport differences.
- Keep developer ergonomics: preserve official `callTool(name, arguments)` return shape `{ content: [] }`, and add `callToolWithPayment` to return `{ content, payment }`.

### Discovery Strategy (well-known first)

- Primary: unauthenticated HTTP GET to `/.well-known/nuwa-payment/info` before establishing MCP connection.
  - Must not require authentication; suitable for CDN caching.
  - Returns discovery metadata defined by HTTP client's `ServiceDiscoverySchema`.
  - Recommended to include a DID signature (`signature`) over a canonicalized payload for integrity.
- Fallbacks:
  - MCP tool `nuwa.discovery` after connection (if available).
  - Static configuration (last resort, e.g., for offline or testing).

### Architecture Overview

- PaymentState (reuse):
  - Central store for channelId, channelInfo, subChannelInfo, keyId/vmIdFragment, pendingSubRAV, monotonic nonce guard, pending payment requests.
- ChannelManager (adapter-driven):
  - Orchestrates lifecycle: ensure ready → discover → recover/create → authorize sub-channel → persist state.
  - Depends on a ChannelServiceAdapter (transport-agnostic) for concrete operations.
- ChannelServiceAdapter (new):
  - discoverService(): serviceDid, basePath, chain info
  - recoverFromService(): RecoveryResponse { channel?, subChannel?, pendingSubRav? }
  - commitSubRAV(signedSubRAV)
  - getChannelInfo(channelId)
  - getSubChannelInfo(channelId, vmIdFragment)
  - authorizeSubChannel(channelId, vmIdFragment)
  - Implementations:
    - HttpAdapter (existing HTTP path)
    - McpAdapter (new; backed by built-in tools: nuwa.health, nuwa.recovery, nuwa.commit, nuwa.authorize, nuwa.channelInfo, nuwa.subChannelInfo)
      - Discovery is provided by well-known; do not rely on MCP tool for first-connect discovery.
- McpRequestManager (new, lightweight):
  - Serializes payable tool calls, associates clientTxRef with a payment bridge, performs single 402 retry with signed SubRAV.

### Server Contract & Discovery

- Well-known discovery (preferred):
  - Path: `GET /.well-known/nuwa-payment/info` (no auth).
  - Base schema (aligns with `ServiceDiscoverySchema` used by HTTP client):
    - `version: number`
    - `serviceId: string`
    - `serviceDid: string`
    - `network: string`
    - `defaultAssetId: string`
    - `defaultPricePicoUSD?: string`
    - `basePath: string` (e.g., `/payment-channel`)
  - Optional extensions (non-breaking):
    - `endpoints?: { mcp?: string, httpBase?: string, channelService?: string }`
    - `supports?: { mcpTool?: boolean, httpWellKnown?: boolean }`
    - `signature?: { alg: string, value: string, signedFields?: string[] }`
  - Clients verify signature when present: resolve DID doc → verify over canonical payload.
- All tool results are MCP `{ content: Content[] }`.
- Payment info is returned as a dedicated resource content item:
  - `resource.uri = "nuwa:payment"`
  - `resource.mimeType = "application/vnd.nuwa.payment+json"`
  - `resource.text` is a JSON string for `SerializableResponsePayload` (BigInt as strings)
- Built-in tools available for lifecycle operations as listed above.

### Client API

- `callTool(name, arguments)` → `{ content: Content[] }` (official shape)
- `callToolWithPayment(name, arguments)` → `{ content: Content[], payment?: PaymentInfo, clientTxRef: string }`
- Lifecycle helpers exposed for advanced usage:
  - `ensureChannelReady()`
  - `discoverService()`
  - `recoverFromService()`
  - `commitSubRAV(signed)`
  - `getPendingSubRAV()` / `clearPendingSubRAV()`
- Internals:
  - Request parameters include reserved keys with strict schema:
    - `__nuwa_auth` (NIP1SignedObject) — carries DID and key_id
    - `__nuwa_payment` (SerializableRequestPayload) — built via `HttpPaymentCodec.toJSONRequest`
  - Response parsing:
    - Business data: first `text` item or tool-native content
    - Payment: `HttpPaymentCodec.parseMcpPaymentFromContents(contents)`
    - If `PAYMENT_REQUIRED` + `subRav`, sign and retry once

### Client Decision Flow

- Pre-connect:
  1. Fetch `/.well-known/nuwa-payment/info`.
  2. If `signature` exists, verify against `serviceDid`.
  3. Persist discovery result and bind client namespace to `serviceDid`.
- Connect: 4) Establish MCP connection using discovered endpoint (if provided) or configured URI. 5) If well-known unavailable, after connect call `nuwa.discovery` as fallback. 6) Validate consistency of `serviceDid` across sources; if mismatch, fail fast.

### Persistence and Namespacing

- Persist state keyed by `serviceDid` (from well-known; fallback to MCP tool discovery if absent).
- Fields: channelId, pendingSubRAV, lastUpdated; plus implicit keyId/vmIdFragment from signer.

### Implementation Steps

1. Define `ChannelServiceAdapter` interface (transport-agnostic).
2. Implement `McpAdapter` using built-in tools (nuwa.\*) and `PaymentChannelPayerClient` for create/open paths where needed.
3. Generalize `ChannelManager` to accept adapter; inject `McpAdapter` within MCP client.
4. Introduce `McpRequestManager` to serialize payable calls and bridge payment completion.
5. Wire MCP client to use: ensureKeyFragmentPresent → loadPersistedState → ensureChannelReady → authorize sub-channel.
6. Switch persistence namespace from host to `serviceDid`.
7. Update E2E: add discovery/recovery/authorize/commit assertions for MCP flow.
8. Update docs and examples to highlight `callTool` and `callToolWithPayment` usage.

### Open Questions / Extensibility

- Streaming tools over MCP: align with resource item appended on final chunk; allow multiple payment frames, last one wins.
- Multi-asset support: future extension in `SerializableRequestPayload` and `SerializableResponsePayload`.
- Rate provider injection for client-side unsettled estimations (parity with HTTP client utility).

### Appendix: Types

- SerializableRequestPayload / SerializableResponsePayload — shared across HTTP/MCP; encoded/decoded via `HttpPaymentCodec`.
- PaymentInfo — normalized client-side payment summary for application consumption.

### Appendix: Well-known nuwa-payment/info (minimal example)

```json
{
  "version": 1,
  "serviceId": "nuwa-payment-service",
  "serviceDid": "did:key:z6Mk...",
  "network": "rooch:testnet",
  "defaultAssetId": "0x3::gas_coin::RGas",
  "basePath": "/payment-channel",
  "endpoints": {
    "mcp": "https://example.com/mcp",
    "httpBase": "https://example.com/api",
    "channelService": "https://example.com/api/payment"
  },
  "supports": { "mcpTool": true, "httpWellKnown": true }
}
```
