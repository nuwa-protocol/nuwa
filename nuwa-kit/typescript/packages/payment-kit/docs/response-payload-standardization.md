# Payment Response Payload Refactor Proposal

> **Status**: Proposal – to be implemented in the next minor release (`v0.x.+1`).

During the recent refactor we standardised the _request_ side of the HTTP
payment protocol by renaming `HttpRequestPayload` to `PaymentRequestPayload` and
adding a mandatory `version` field.

This document proposes an equivalent standardisation for the _response_ side
and the associated codec interfaces.

---

## 1. Rename `HttpRequestPayload` / `HttpResponsePayload`

| Current name          | Proposed name            | Rationale                                                                        |
| --------------------- | ------------------------ | -------------------------------------------------------------------------------- |
| `HttpRequestPayload`  | `PaymentRequestPayload`  | – Removes protocol-specific prefix.<br/>– Aligns with response naming.           |
| `HttpResponsePayload` | `PaymentResponsePayload` | – Removes protocol-specific prefix.<br/>– Symmetry with `PaymentRequestPayload`. |

Both legacy types will be kept for **one minor version** as type aliases to
avoid breaking downstream code immediately:

```ts
/** @deprecated – use PaymentRequestPayload */
export type HttpRequestPayload = PaymentRequestPayload;

/** @deprecated – use PaymentResponsePayload */
export type HttpResponsePayload = PaymentResponsePayload;
```

Downstream packages should switch to the new name before the alias is removed
in the subsequent **major** release.

---

## 2. Field-level changes

### 2.1 Versioning

- Add a **required** `version: number` field (default `1`). This mirrors the
  request side and makes future schema evolution explicit.

### 2.2 Cost/Amount nomenclature

- Rename `amountDebited` → `cost` for clarity and brevity.
- Type remains `bigint`.

### 2.3 Error handling strategy

保留响应头中的协议级错误信息（protocol-level errors）。

动机：验证/计费上下文阶段（例如 `maxAmount` 检查）可能在业务处理前发生，且业务层响应体结构不统一，SDK 很难通用解析。将错误摘要放入统一的支付协议响应头，可保证客户端在任何业务响应体下都能稳定获知错误并做出正确恢复（例如清理 `pendingSubRAV`、重握手等）。

建议：

- 成功：返回 2xx，并在响应头携带成功的 `PaymentResponsePayload`（含 `subRav` 与 `cost`）。
- 失败（协议级错误，如 `MAX_AMOUNT_EXCEEDED`、`INVALID_PAYMENT`、`INSUFFICIENT_FUNDS` 等）：返回合适的 HTTP status（400 / 402 / 409 / 500），并在响应头附带 `PaymentResponsePayload.error`；此时可不包含 `subRav` 与 `cost`。
- 业务错误是否在 body 返回，自由决定；SDK 仅依赖响应头完成支付协议层解析与恢复，不依赖业务 body 结构。

### 2.4 Transaction references

- Keep both `clientTxRef?` and `serviceTxRef?` – they are actively used for
  idempotency and audit-trail.
- No renaming required.

### 2.5 Fields to **remove**

None at this stage – all remaining properties have clear use-cases. Extra data
can be attached via the `extensions?: Record<string, unknown>` escape hatch if
required in the future.

### 2.6 Resulting type definition

```ts
export interface PaymentResponsePayload {
  /** Service-proposed next SubRAV (unsigned, client will sign) */
  subRav?: SubRAV;
  /** Cost of this request (in asset's base unit). Present on success. */
  cost?: bigint;

  // --- Optional metadata --------------------------------------------------
  clientTxRef?: string;
  serviceTxRef?: string;

  /** Protocol-level error info. Present on error responses. */
  error?: {
    code: string; // e.g. 'MAX_AMOUNT_EXCEEDED', 'INVALID_PAYMENT', 'INSUFFICIENT_FUNDS'
    message?: string; // human-readable message
  };

  /** Payload schema version (default: 1) */
  version: number;
}
```

---

## 3. Codec interface refactor

### 3.1 `PaymentCodec`

The **protocol-agnostic** codec currently only supports _request_ encoding
(`encode/decode`). We extend it to cover the response path and to make the
method names explicit:

```ts
export interface PaymentCodec {
  /* Request header ------------------------------------------------------- */
  encodeRequest(payload: PaymentRequestPayload): string;
  decodeRequest(encoded: string): PaymentRequestPayload;

  /* Response header ------------------------------------------------------ */
  encodeResponse(payload: PaymentResponsePayload): string;
  decodeResponse(encoded: string): PaymentResponsePayload;
}
```

The older `encode/decode` pair will be kept as **deprecated** aliases mapping
internally to `encodeRequest/decodeRequest`.

### 3.2 `HttpPaymentCodec`

`HttpPaymentCodec` becomes a concrete implementation of the extended interface.
Key changes:

- Implement the new four methods.
- Internally reuse existing helpers (`buildRequestHeader`, `parseRequestHeader`, `buildResponseHeader`, `parseResponseHeader`).
- `buildResponseHeader` / `parseResponseHeader` are updated到新的 `PaymentResponsePayload` 结构：
  - 支持成功与失败两种分支：
    - 成功：序列化 `subRav`, `cost`, `clientTxRef`, `serviceTxRef`, `version`。
    - 失败：序列化 `error`, `clientTxRef`, `serviceTxRef`, `version`（可无 `subRav`/`cost`）。
- 兼容旧字段：
  - 读取旧 `amountDebited` → 新 `cost`；
  - 读取旧 `errorCode`(number) → 映射为新 `error.code`(string)；
  - 写入仍以新结构为准；旧结构保留一小段过渡期作为只读兼容。

### 3.3 Migration strategy

| Release | Change                                                                                                                              |
| ------- | ----------------------------------------------------------------------------------------------------------------------------------- |
| v0.x.+1 | Add new types + codec methods；`HttpResponsePayload` 作为 `PaymentResponsePayload` 的别名保留；`amountDebited`/`errorCode` 读兼容。 |
| v0.x.+2 | 对旧 API 使用打 `@deprecated` 警告；SDK 在响应中优先解析 `error` 字段；测试覆盖错误分支。                                           |
| v1.0.0  | 删除别名与旧字段写入路径，仅保留新结构。                                                                                            |

CI will fail on usage of deprecated APIs starting **v0.x.+2** to encourage
migration before the major release.

---

## 4. Open questions / TODOs

1. **Error Code Registry** – 定义一份规范的错误码枚举（`src/errors/`），与服务端/客户端共享：
   - `MAX_AMOUNT_EXCEEDED` → 400；
   - `INVALID_PAYMENT` / `UNKNOWN_SUBRAV` / `TAMPERED_SUBRAV` / `CHANNEL_CLOSED` / `EPOCH_MISMATCH` → 400；
   - `INSUFFICIENT_FUNDS` / `PAYMENT_REQUIRED` → 402；
   - `SUBRAV_CONFLICT` → 409；
   - 其他 → 500。
2. **Schema Validation** – 更新 `src/schema/api` 的 Zod/类型定义，加入 `PaymentResponsePayload.error` 与 `version`。保留 `HttpResponsePayload` 兼容别名。
3. **Client Handling** – `PaymentChannelHttpClient.handleResponse()` 检测响应头中的 `error`（或旧 `errorCode`），在有 `clientTxRef` 时拒绝对应 `pendingPayments`，并根据错误码做状态恢复（清理 `pendingSubRAV`、重置握手等）。
4. **Server Behavior** – 在计费前置校验失败（如 `maxAmount`）时，也应返回带有 `PaymentResponsePayload.error` 的响应头，以便客户端无需解析业务 body 即可处理错误；同时设置合适的 HTTP status。
5. **Test Coverage** – 补充错误分支的 e2e/单测，覆盖 maxAmount 超限、无效签名、余额不足等。
6. **Docs** – 实现后更新 HTTP 集成文档与示例代码片段。

Contributions and feedback are welcome. Please open an issue or a PR.
