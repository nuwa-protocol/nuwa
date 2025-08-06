# Max-Amount Limit Refactor (V1)

> Status: **Draft – waiting for implementation PR**  
> Last updated: {{DATE}}

---

## 1. Background

`HttpPayerOptions.maxAmount` 最初被设计为「**单次请求** 最多能接受的资产扣费上限」。

现有实现的问题：

1. **累计值比较错误**  
   Payer 端用 `SubRAV.accumulatedAmount`（通道累计值）直接与 `maxAmount` 比较，
   结果通道运行一段时间后必然触发上限。
2. **Payee 无感知**  
   `maxAmount` 未随请求发给服务端，Payee 无法在生成下一个 `SubRAV` 时判断，导致超额后只能依赖 Payer 拒绝签名再重试。
3. **计价单位不明确**  
   服务端计费使用资产最小单位（token），但文档/注释没有强调，容易误认为是 pico-USD。

---

## 2. 目标

* 修正比较逻辑 → 使用 **增量值** (`deltaAmount`) 而不是累计值。  
* 将 `maxAmount` 随 Header 一并发送，让 **Payee 可提前判断**。  
* 提炼协议无关的数据结构 `PaymentHeaderPayload`，统一多协议编解码。  
* 明确 `maxAmount` 单位：**资产最小计量单位**。

---

## 3. 技术方案

### 3.1 新公共数据结构

```ts
// core/types.ts
export interface PaymentHeaderPayload {
  /** Signed SubRAV from client */
  signedSubRav: SignedSubRAV;
  /** Per-request max amount (token smallest unit) */
  maxAmount: bigint;
  /** Optional client-side tx reference (idempotency) */
  clientTxRef?: string;
  /** Protocol version (default: 1) */
  version: number;
}

// 兼容旧代码
export type HttpRequestPayload = PaymentHeaderPayload;
```

### 3.2 Codec 调整

* **HttpPaymentCodec**
  * `encode()`⇒ `encode(payload: PaymentHeaderPayload)`
  * `decode()` 返回 `PaymentHeaderPayload`
  * Header 名仍为 `X-Payment-Channel-Data`
* 未来其他协议（MCP、WebSocket…）编写各自 `*PaymentCodec` 时，也直接读写 `PaymentHeaderPayload`。

### 3.3 Payer 侧修改

| 位置 | 变更 |
|------|------|
| `PaymentChannelHttpClient.addPaymentChannelHeader()` | ```ts
const headerValue = codec.encode({
  signedSubRav,
  maxAmount: this.options.maxAmount,
  clientTxRef: uuidv4(), // 可选
});
``` |
| `PaymentChannelPayerClient.validateSubRAVForSigning()` | 计算 `deltaAmount = subRAV.accumulatedAmount ‑ prevState.accumulatedAmount`，并与 `maxAmount` 比较。 |

### 3.4 Payee 侧修改

1. **HttpBillingMiddleware.buildRequestMetadata**
   ```ts
   maxAmount: paymentData?.maxAmount
   ```
2. **PaymentProcessor.processPayment** 在计费完成后加入：
   ```ts
   if (cost > maxAmount) {
     return { success: false, error: 'OVER_BUDGET', errorCode: 'MAX_AMOUNT_EXCEEDED', cost, ... };
   }
   ```
   返回 402。
3. 保持其余逻辑不变。

---

## 4. 数据流示意

```mermaid
graph LR
  subgraph Client (Payer)
    A[Request + Header<br/>PaymentHeaderPayload]
  end
  subgraph Service (Payee)
    B[HttpBillingMiddleware]
    C[PaymentProcessor]
    D[generate SubRAV]
  end
  A -- Header(maxAmount) --> B -- pass maxAmount --> C
  C -- cost<=max? --> D
  D -- Proposal(SubRAV) --> A
```

---

## 5. 版本策略与迁移

1. 客户端 **必须** 在 `PaymentHeaderPayload` 中发送 `maxAmount` 与 `version` 字段。  
2. 发布 **minor 版本**（例如 `0.x.+1`）。  
3. 客户端侧：  
   * 升级依赖后需保证 `maxAmount` 单位为 token。  
   * 建议使用 `/payment-channel/price` API 将预算 USD ⇒ token。

---

## 6. 待办

- [ ] 修改 `core/types.ts` 引入 `PaymentHeaderPayload`。  
- [ ] 重构 `HttpPaymentCodec`。  
- [ ] 客户端：`PaymentChannelHttpClient` 发送新 payload。  
- [ ] 客户端：`PaymentChannelPayerClient` 增量检查。  
- [ ] Payee：`HttpBillingMiddleware`、`PaymentProcessor` 使用 `maxAmount`。  
- [ ] 单元 / E2E 测试覆盖：
  * over-budget 被拒绝
  * 满足预算正常签完
- [ ] 文档 & 示例更新。

---

> **NOTE**: implementors should update any language bindings (Python/Go/…) to use the new `PaymentHeaderPayload` as well.
