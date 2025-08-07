# TxRef & Payment Information Design

> **Status:** Draft – proposed protocol enhancement

## 1  Background

Payment Kit 的 HTTP 协议目前仅在 _请求头_ 携带 `clientTxRef`，而 _响应头_ 只包含 `serviceTxRef`、`subRav`、`amountDebited` 等字段。这导致：

* SDK **无法可靠地把支付信息与请求对应** – 并发场景下“上一条”并不等于“本条”。
* 调用方若想获知本次请求的费用，只能解析 Header 并自行比对 nonce 或金额差值，逻辑复杂且易出错。

## 2  Actors & Identifiers

| 字段            | 产生方     | 目的                                   | 调用方预知 | 并发匹配 |
|-----------------|-----------|----------------------------------------|-----------|-----------|
| `clientTxRef`   | **客户端** | 幂等性、调用方日志、并发匹配           | ✅         | ✅         |
| `serviceTxRef`  | 服务端     | 链上 claim / 后台账务 / 审计           | ❌         | －        |

## 3  Proposed Protocol

### 3.1  Request Header (`X-Payment-Channel-Data`)
```jsonc
{
  "signedSubRav": { /* … */ },
  "maxAmount":   "1000000000",
  "clientTxRef": "uuid-from-client",  // NEW – mandatory
  "version":     1
}
```

### 3.2  Response Header (`X-Payment-Channel-Data`)
```jsonc
{
  "subRav":         { /* unsigned proposal */ },
  "amountDebited":  "123456",               // cost of **this** request
  "clientTxRef":    "uuid-from-client",     // Echo back – 1 : 1 binding
  "serviceTxRef":   "srv-abc-001",          // Optional (server audit)
  "message":        "Payment proposal",
  "errorCode":      0
}
```

* **Echo 回 `clientTxRef`** → 客户端可通过 Map<ref,Promise> 直接解析并 `resolve()`。
* **保留 `serviceTxRef`** → 服务端继续用于链上对账 / 日志。

## 4  SDK Changes

### 4.1  `PaymentChannelHttpClient`

#### clientTxRef 生成策略
采用「**默认 SDK 自动生成，可选让调用方传入**」的方案：

1. **默认行为：SDK 生成**
   - `PaymentChannelHttpClient.request()` 在每次发起请求前自动生成 `clientTxRef`（UUID / nanoid）
   - 调用方零配置即可获得幂等能力，避免不同调用方忘记生成、格式不统一的问题

2. **可选自定义：调用方提供**
   - 在幂等写服务、重放保护、事务批次等场景，业务可能已经有自己的请求 ID
   - SDK API 允许通过 headers 显式传入：
     ```typescript
     await client.request('POST', '/upload', {
       headers: { 'X-Client-Tx-Ref': myIdempotencyKey }
     });
     ```
   - 若调用方提供，SDK 使用该值；否则自动生成

3. **实现细节**
   - `prepareHeaders()` 方法：
     1. 先检查 `init.headers['X-Client-Tx-Ref']` 是否存在
     2. 没有则生成 `uuid()` 并写入
   - `PaymentHeaderPayload.clientTxRef` 直接取该值
   - 服务端回包时原样 echo 回去

#### 请求处理流程
* 生成或获取 `clientTxRef` 并放入请求头。
* 在 `executeRequest()` 前将 `resolve` 保存到 `pendingMap[clientTxRef]`。
* `handleResponse()` 解析响应 → 根据 `clientTxRef` 找到 Promise → `resolve(paymentInfo)`。
* 对外提供：
  ```ts
  interface PaymentResult<T> {
    data: T;
    payment?: PaymentInfo;   // undefined ⇢ free endpoint
  }
  ```

### 4.2  `PaymentInfo` Structure
```ts
interface PaymentInfo {
  clientTxRef: string;
  serviceTxRef?: string;
  cost: string;        // Amount of *this* request (pico-unit)
  nonce: string;       // Completed nonce
  channelId: string;
  assetId: string;
  timestamp: string;   // ISO8601 – generated client-side when resolved
}
```

## 5  Free Endpoint Handling
* 响应头缺少 `X-Payment-Channel-Data` ⇒ `payment` 为 `undefined`。
* 调用方通过 `if (result.payment)` 判断是否收费。

## 6  Backward Compatibility
* 服务器如果暂未实现 echo 回 `clientTxRef`，SDK 仍能回退到旧逻辑（根据 `pendingSubRAV` 差分估算）。
* 一旦服务器升级，新字段即时生效，无需客户端代码变更。

## 7  Migration Plan
1. **Server** – 修改 `HttpPaymentCodec.encodeResponse()`，把解析到的 `clientTxRef` 原样写回。
2. **SDK**  – 实现 `pendingMap` + `requestWithPayment()` 逻辑。
3. **CLI / Higher layer** – 使用新的返回结构显示费用。

---

> 该文档旨在形成协议共识，欢迎 PR / 讨论。
