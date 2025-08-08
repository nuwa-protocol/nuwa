# RAV Handling Protocol

> **Status**: Draft | **Applies to**: HTTP Payment Kit (Express back-end) & PaymentChannelHttpClient (front-end)

This document consolidates the latest design decisions about how **Receipt-And-Voucher (RAV)** data is exchanged between client and server, especially for:

* _free_ routes (cost = 0)
* routes that do **not** declare `paymentRequired`
* preventing repeated handshake (nonce 0, amount 0) loops

---

## 1  Key terminology

| Term | Meaning |
| ---- | ------- |
| **Signed SubRAV** | JSON object signed by **payer** and sent **from client → server** for the _previous_ request. |
| **Unsigned SubRAV (proposal)** | JSON object created by **server** and sent **to client**; client must sign it for the _next_ request. |
| **Handshake (legacy)** | Signed SubRAV with `nonce = 0` and `accumulatedAmount = 0`. Legacy only. The HTTP Payment Kit client does not initiate handshake in normal operation. |
| `paymentRequired` | Route-level flag (set via `RouteOptions`) that forces the client to supply a Signed SubRAV; server returns **HTTP 402** if absent. |

---

## 2  State machine on the client side

```text
             +----------------+
             |   UNKNOWN      |
             | (default)      |
             +------+---------+
                    | call **/payment-channel/recover**
                    v
             +------+---------+
             |   PAID         |  <──── (header with proposal OR HTTP 402)
             | (RAV required) |
             +------+---------+
                    | recv 200 OK w/o header **and** no pending proposal
                    v
             +------+---------+
             |   FREE         |
             | (pure free)    |
             +----------------+
```

* **PAID** – every request **must** carry a Signed SubRAV (either handshake or follow-up).
* **FREE** – route is fully free; neither side exchanges RAV once handshake and pending proposal are both cleared.

The client maintains only a cached `pendingSubRAV`. No handshake state, no path-level cache, and no magic counters are required.

### Transition rules (simplified)

| From | Condition | To |
| ---- | --------- | -- |
| UNKNOWN | `/recover` returns proposal **or** later response has header / 402 | PAID |
| UNKNOWN | `/recover` returns 404 **and** first business response 200 without header | FREE |
| PAID | Response 200 & _no_ header **and** `pendingProposal == undefined` | FREE |
| FREE | Response has header **or** status 402 | PAID |

---

## 3  What the client sends

| Situation | Signed SubRAV carried? |
| ----------| --------------------- |
| Startup & no local channel state | Derive deterministic `channelId = deriveChannelId(payerDid, serviceDid, defaultAssetId)` and check on-chain status. If channel exists → call `/recovery`; if it returns a proposal → sign & send. If channel does not exist → open channel then operate. |
| `pendingSubRAV` exists  | **Yes** – sign & send it. |
| `pendingSubRAV` absent | **No** – treat as FREE (no RAV). |

Note: The client never sends a nonce=0 handshake RAV.

### 3.1  Recovery trigger conditions

- Recovery is used to repair local state loss. The client should call `/recovery` only when:
  - Local channel state is missing, and
  - The deterministic channel derived from `(payerDid, serviceDid, defaultAssetId)` is confirmed to exist on-chain.
- If the deterministic channel cannot be derived (e.g., missing metadata) or does not exist on-chain, skip recovery and open a new channel.
- Absence of `pendingSubRAV` alone does not require recovery.

---

## 4  Server-side behaviour

### 4.1  General rule – **pending proposal has highest priority**

Before looking at the route configuration the server checks its `pendingSubRAVStore`:

| Condition | Action |
|-----------|--------|
| **Pending unsignedSubRAV exists**<br>for `(channelId, vmIdFragment)` | • Must receive the matching **Signed SubRAV**.<br>• If absent ⇒ server should attempt DIDAuth fallback (see §4.4) to locate the sub-channel; if pending still applies but signature is missing ⇒ respond **402** ("signature required").<br>• On success ⇒ verify, settle cost (may be 0), return next **Unsigned SubRAV** (see §4.2 rules for paid routes). |
| **No pending proposal** | Continue with route-level logic below. |

### 4.2  Paid routes (`paymentRequired = true`)

无论本次 `cost` 是否为 **0**，服务器在成功验证后都应生成并返回下一条 **Unsigned SubRAV**（`nonce+1`，`amount += cost`）。

| Server state | Action |
|--------------|--------|
| **No pending proposal** | • 若请求没有携带 Signed SubRAV，也视为允许（通道首次调用或恢复后第一次调用）。<br>• 服务器计算 `cost`，构造下一条 Unsigned SubRAV，并在响应 Header 中返回。 |
| **Pending proposal exists** | • 必须收到对应 Signed SubRAV，否则 402。<br>• 验证通过后计算 `cost` 并返回新 Unsigned SubRAV（即使 `cost = 0` 也返回）。 |

### 4.3  Free routes (`paymentRequired = false`)

| Client sends | Server action |
| ------------ | ------------- |
| **Signed SubRAV** | • 验证 (`nonce_new = prevNonce + 1`, `amount_new ≥ prevAmount`) 并结算（此处 `cost` 必为 0）。<br>• **不返回** Unsigned SubRAV。 |
| **No RAV**   | 执行业务逻辑；返回 **200**，不附带支付 Header。若提供了 DIDAuth，服务端可用于定位子通道并在内部乐观递增 nonce（可选）。若定位到的子通道存在未完成的 pending proposal，但本次未携带匹配签名，应返回 **402**（见 §4.4）。 |

### 4.4  Locating the channel when RAV is absent (DIDAuth fallback)

1. Parse **DIDAuth** header → `{ did, keyId }`.  
2. `vmIdFragment = keyId.split('#')[1]`.  
3. `channelId = deriveChannelId(did, serviceDid, defaultAssetId)`.  
4. Look up sub-channel state by `(channelId, keyId)`.
   * **Found** → treat as FREE（继续 0 成本序列）。如该子通道存在 pending proposal 而本次未携带匹配签名，返回 **402** 强制客户端补签。
   * **Not found** → respond **402**（客户端需先 `/recovery` 或握手）。

---

## 5  Implementation checkpoints

### Client (`PaymentChannelHttpClient`)
1. 持久化仅保存 `channelId` 与 `pendingSubRAV`（删除握手相关状态）。
2. 在 `addPaymentChannelHeader()` 中按 §3 决策：
   - 有 `pendingSubRAV` → 签名后发送；
   - 否则 → 不携带 RAV（FREE 模式）。
3. 启动且本地无通道状态时：先用 `(payerDid, serviceDid, defaultAssetId)` 推导 `channelId` 并查询链上是否存在；若存在则调用 `/payment-channel/recovery`（若返回 proposal → 立即签名并发送），若不存在则打开通道后再操作。
4. 不需要按路径缓存 `routeMode`。

### Server
1. `HttpBillingMiddleware` – 当 `!paymentRequired && !signedSubRAV` 时，尝试 DIDAuth 回退（见 §4.4）定位子通道；如定位到存在 pending proposal 但缺少匹配签名，返回 **402**。
2. `PaymentProcessor.preProcess()`（pre-flight）– 对付费路由，即使 `cost = 0` 也生成并返回下一条 Unsigned SubRAV（与 §4.2 一致）。
3. `PaymentChannelPayerClient.validateSubRAVForSigning()` – 允许在 `cost = 0` 时 `amount_new == amount_prev`。
4. `BillableRouter.register()` – 逻辑不变；开发者按需开启 `paymentRequired`。

---

## 6  Future work

* **Service-info Endpoint** – expose route metadata (`paymentRequired`, pricing) so the client can skip discovery.
* **Cross-protocol Alignment** – replicate the same logic for JSON-RPC (MCP) & A2A transports.
* **Testing** – add E2E cases: (1) FREE route with and without RAV; (2) FREE ↔ PAID transitions; (3) paid route with `cost=0` still returning unsigned; (4) FREE route with pending-but-missing-signature returning 402.

---

## 7  Refactoring roadmap (safe-first, then protocol alignment)

This document describes the target protocol behavior. To align existing code safely, we will refactor in two phases:

### 7.1 Phase 1 – Non-breaking cleanup (no behavior change, tests must stay green)

- Client (`PaymentChannelHttpClient.ts`)
  - Extract helpers without changing logic:
    - `shouldAttachRav(state, options)` – wraps current decision (pendingSubRAV or legacy handshake path).
    - `buildSignedSubRavIfNeeded()` – encapsulates “sign pending” vs “build-and-sign handshake (nonce=0)” branches.
    - `encodePaymentHeader(payload)` / `parsePaymentHeader(value)` – thin wrappers around `HttpPaymentCodec`.
  - Keep existing states and persistence as-is:
    - Retain `ClientState` including `HANDSHAKE`/`READY`.
    - Retain `HttpClientState.isHandshakeComplete` and `PersistedHttpClientState.isHandshakeComplete` (mark as deprecated only).
  - Reduce duplication:
    - Make deprecated `parseJsonResponse()` call the schema-based parser internally (or vice versa), without changing outputs.
  - Do not introduce automatic `/recovery` calls here.

- Processor (`PaymentProcessor.ts`)
  - Consolidate duplicated code paths, keep behavior unchanged:
    - Extract `buildFollowUpUnsigned(priorSignedSubRav, cost)` and let both `generateSubRAV` / `generateSubRAVSync` reuse it.
    - Extract `verifyAndProcessSignedSubRAV(signedSubRAV)` to unify handshake/regular verification, keep stats and branches.
  - Keep pre-flight `cost===0` → “skip unsigned generation” behavior unchanged in this phase.
  - Keep legacy `processPayment()` but redirect internally to `preProcess + settle + persist` where possible; keep return shape.

- Scope
  - No public API or wire format changes.
  - All unit/integration/E2E tests must pass unchanged.

### 7.2 Phase 2 – Protocol alignment (implement the behavior in this spec)

- Client
  - Remove legacy handshake emission and related state.
    - Delete `isHandshakeComplete` from `HttpClientState` and `PersistedHttpClientState`.
    - Requests carry RAV only when `pendingSubRAV` exists; never send `nonce=0` handshakes.
    - Persistence only stores `channelId` and `pendingSubRAV`.
  - Recovery is only used when local state is missing but the deterministic channel exists on-chain.

- Server
  - Paid (pre-flight) routes: even when `cost=0`, return the next unsigned proposal.
  - Free routes: if a pending exists but the request lacks the matching signature, use DIDAuth fallback to locate the sub-channel and respond `402`.
  - Remove handshake-specific metrics/branches in `PaymentProcessor`.

- Tests
  - Add/adjust E2E cases per §6 to cover FREE/PAID transitions, `cost=0` pre-flight unsigned generation, and FREE-with-pending-missing-signature → `402`.

Notes
 - Phase 1 prepares the code structure (helpers, reduced duplication) to minimize diff in Phase 2.
 - Phase 2 switches behavior to match this document while keeping the public API stable.

