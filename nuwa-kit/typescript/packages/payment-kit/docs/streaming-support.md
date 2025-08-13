### 流式输出计费支持方案（Streaming Billing Support）

本方案面向 `@nuwa-ai/payment-kit` 在支持流式输出（SSE、chunked、OpenAI 样式的流响应等）时的计费与结算集成。目标是在不阻塞首包的前提下，既兼容现有“协议头（X-Payment-Channel-Data）”工作流，又能正确完成延迟计费（deferred）策略的结算与状态持久化。

---

### 背景与现状分析

- 服务端（`transport/express/ExpressPaymentKit.ts`）

  - 当前通过 `on-headers` 在响应头写出前同步写入支付协议头（`X-Payment-Channel-Data`）。
  - 计费单元 `units` 由 `res.locals.usage` 提供，并在 `on-headers` 钩子中调用 `middleware.settleBillingSync(billingContext, units, resAdapter)` 完成结算头写入；响应结束后（`res.on('finish')`）若存在待持久化的 Proposal 则落库。
  - 对于流式输出，使用量在首包时尚未知，导致“必须在写 headers 前得出费用”的假设不成立。

- 客户端（`integrations/http/PaymentChannelHttpClient.ts`）
  - 期望在响应头中读取协议头，成功分支解析 `subRav/cost/...` 并完成后续逻辑；无协议头则被视为“免费”或根据 HTTP 状态进行错误映射。
  - 对于流式输出，当服务器无法在首包写入最终费用协议头时，现有客户端无法得到本次请求的结算信息。

结论：要支持“按输出量计费”的流式接口，必须允许“延迟写结算结果”，而 HTTP 规范要求响应头在响应体之前发出。因此需要在“首包后”以其他方式传递结算信息，或提供带 `clientTxRef` 的结算查询能力。

---

### 设计目标

- 支持以下流式形态：
  - Server-Sent Events（`text/event-stream`）
  - chunked 与 ReadableStream（例如 NDJSON）
  - OpenAI 风格的 `data: ...` 分块输出
- 不阻塞首包，不影响已有的非流式端点行为。
- 和现有协议保持兼容：保留 `X-Payment-Channel-Data` 作为非流式默认路径；为流式提供“等价结算信息”的传输与获取方式。
- 支持延迟计费策略（例如 `PerToken` 的 `deferred=true`）。

---

### 方案一（推荐）：基于轮询的结算查询（Polling-based Settlement Lookup）

核心思路：在响应体开始发送后，无法再写入“普通响应头”。因此服务端在流结束时完成结算与持久化，并新增一个“按 `clientTxRef` 查询结算结果”的只读接口；客户端在检测到“流式且无协议头”时，后台轮询该接口直至拿到结算结果或超时。

#### 协议扩展（服务端新增内置接口）

- 路径：`GET {basePath}/payments/:clientTxRef`
- 返回：`ApiResponse<PaymentResponsePayload>`（与现有头内负载完全一致）
- 语义：
  - 若已完成结算（服务端在 `finish`/`close` 后结算并持久化），返回 `{ success: true, data: { subRav, cost, costUsd, clientTxRef, serviceTxRef, version } }`。
  - 若未就绪，返回 `{ success: false, error: { code: 'INTERNAL_SERVER_ERROR' | 'NOT_READY', httpStatus: 404/425 } }`，客户端继续轮询或回退。

建议错误码：

- 404 Not Found（未找到同 `clientTxRef` 的记录）
- 425 Too Early（记录存在但仍在结算中，可选）

#### 服务端流程（ExpressPaymentKit）

1. 预处理：保持现有 DIDAuth、RAV 验证与 `BillingContext` 构建。
2. 流式标识：当该路由为“流式输出”时，禁用 `on-headers` 自动结算写头，转为“结束时结算，持久化结果供查询”。
   - 判断方式（任一满足即可）：
     - 路由注册时标注 `options.streaming=true`（推荐）
     - 运行期根据 `Content-Type`/实现（如 `text/event-stream`）判定（兜底）
3. 结算时机：在 `res.on('finish')` 与 `res.on('close')`（客户端断开）里：
   - 汇总使用量（例如累积 tokens 数），调用 `middleware.settleBillingSync(ctx, units)` 得到 `unsignedSubRAV` 与 `cost`
   - 将“最终 PaymentResponsePayload（含 `clientTxRef`）”持久化到新引入的 `SettlementRepository`
4. 新内置接口处理：`GET /payments/:clientTxRef` 从 `SettlementRepository` 取回对应负载并返回。

存储设计：

- 新增 `SettlementRepository` 接口（内存/SQL 实现），键为 `clientTxRef`，值为 `PaymentResponsePayload`，并可配置 TTL（例如 30 分钟）。
- SQL 表结构可以非常精简：`client_tx_ref`（PK）、`payload_json`、`created_at`、可选二级索引（`channel_id`、`vm_id_fragment`）。

使用量收集：

- 提供一个极简的辅助器，便于路由在生成流期间累加使用量：
  - 服务端可暴露 `createStreamBillingHelpers(res)`（示意 API）
    - `addUsage(units: number)`：在业务层每产生一批 tokens/chunk 时累加
    - `finalize()`：可选；若调用则立即执行结算与持久化（适用于手动完结场景）
  - 底层实现把累加值存放在 `res.locals.usage` 或独立计数器，结束时读取并结算

#### 客户端流程（PaymentChannelHttpClient）

1. 正常发起请求并生成 `clientTxRef`（已支持）。
2. 处理响应：
   - 若读取到协议头（非流式），按现有逻辑处理。
   - 若无协议头并判断为“流式响应”（例如 `Content-Type: text/event-stream`、`application/x-ndjson`、`application/octet-stream` 且 `Transfer-Encoding: chunked` 等）：
     - 后台启动轮询：每 250～500ms 调 `GET {basePath}/payments/:clientTxRef`（指数退避，最多 `timeoutMs`，默认 30s，可配置）
     - 取回 `PaymentResponsePayload` 后，复用现有成功分支逻辑：缓存 `subRav` 为下一次签名的 `pendingSubRAV`，构造 `PaymentInfo` 并 `resolve(paymentPromise)`。
3. 超时与失败：按现有超时机制拒绝 `paymentPromise`；应用可根据自身需求决定是否取消流、重试等。

优点：

- 兼容性最好：避免使用 HTTP Trailers；不需要在流内混入“控制帧”。
- 与现有客户端/服务端结构耦合度低，改动范围明确。

缺点：

- 需要一次额外的轮询请求（通常对延迟影响可忽略）。

---

### 方案二（可选）：在流内携带“支付帧”（In-band Payment Frame）

核心思路：在流中插入一条结构化“控制帧”，携带 `PaymentResponsePayload`，客户端解析该帧以完成结算承诺和本地缓存。

支持形式：

- SSE：发送事件 `event: nuwa-payment`，`data: <base64(JSON of PaymentResponsePayload)>`；
- NDJSON：插入一行形如 `{ "__nuwa_payment__": <PaymentResponsePayload> }`；
- OpenAI 样式：插入 `data: { "nuwa_payment": <PaymentResponsePayload> }` 的一帧。

客户端扩展：

- 当检测到流式响应时，若 2s 内未从 `/payments/:clientTxRef` 轮询到结果，可降级尝试解析流内支付帧；解析成功则直接 `resolve(paymentPromise)` 并停止轮询。

优点：

- 单链路传输，无需额外 HTTP 请求。

缺点：

- 需要业务流与通道协议复用同一数据通道，增加实现复杂度；某些上游库对帧格式约束较强。

---

### 客户端过滤“支付帧”（供上层应用透明消费流）

当采用 In-band Payment Frame（在流内注入支付控制帧）时，通常希望“支付层”在内部解析并完成结算后，再将不含支付控制帧的“纯业务流”交给上层应用。实现要点：

- 必须先让支付客户端消费并处理支付帧（完成 SubRAV 提案解析、支付信息解析或后台轮询兜底），再对返回给上层的 `Response` 做“过滤”。
- 否则会把结算所需的信息一起过滤掉，导致无法完成支付处理。
- 对于不使用 In-band 的流（推荐 Polling 方案），无需做任何过滤。

示例（SSE 与 NDJSON 过滤器）：

```ts
// 根据不同流式协议过滤支付控制帧，保留业务数据帧
// 注意：请务必在支付客户端完成支付信息处理后，再调用此过滤器

export function stripPaymentFrames(resp: Response, mode: 'sse' | 'ndjson'): Response {
  const encoder = new TextEncoder();
  const decoder = new TextDecoder();
  const readable = resp.body!;
  let buf = '';
  let pendingEvent: string[] = [];

  const ts = new TransformStream<Uint8Array, Uint8Array>({
    start() {},
    transform(chunk, controller) {
      buf += decoder.decode(chunk, { stream: true });
      const lines = buf.split(/\r?\n/);
      buf = lines.pop() ?? '';

      if (mode === 'sse') {
        // SSE: 过滤 event: nuwa-payment 或 data: { nuwa_payment: ... } 帧
        for (const line of lines) {
          pendingEvent.push(line);
          if (line === '') {
            const isPayment =
              pendingEvent.some(l => l.trim() === 'event: nuwa-payment') ||
              pendingEvent.some(l => {
                const m = l.match(/^data:\s*(.+)$/);
                if (!m) return false;
                try {
                  const obj = JSON.parse(m[1]);
                  return !!obj?.nuwa_payment;
                } catch {
                  return false;
                }
              });
            if (!isPayment) {
              for (const out of pendingEvent) controller.enqueue(encoder.encode(out + '\n'));
            }
            pendingEvent = [];
          }
        }
      } else {
        // NDJSON: 过滤 { "__nuwa_payment__": ... } 行
        for (const line of lines) {
          const t = line.trim();
          if (!t) continue;
          let drop = false;
          try {
            const obj = JSON.parse(t);
            drop = !!obj?.__nuwa_payment__;
          } catch {}
          if (!drop) controller.enqueue(encoder.encode(line + '\n'));
        }
      }
    },
    flush(controller) {
      if (!buf) return;
      if (mode === 'ndjson') {
        const t = buf.trim();
        let drop = false;
        try {
          const obj = JSON.parse(t);
          drop = !!obj?.__nuwa_payment__;
        } catch {}
        if (!drop) controller.enqueue(encoder.encode(buf + '\n'));
      } else {
        // SSE 收尾：把尾部事件作为一个完整事件检查
        pendingEvent.push(buf);
        const isPayment =
          pendingEvent.some(l => l.trim() === 'event: nuwa-payment') ||
          pendingEvent.some(l => {
            const m = l.match(/^data:\s*(.+)$/);
            if (!m) return false;
            try {
              const obj = JSON.parse(m[1]);
              return !!obj?.nuwa_payment;
            } catch {
              return false;
            }
          });
        if (!isPayment) {
          for (const out of pendingEvent) controller.enqueue(encoder.encode(out + '\n'));
        }
      }
    },
  });

  const filtered = readable.pipeThrough(ts);
  // 保留原始状态码与响应头（Content-Length 会失效，由浏览器改为 chunked）
  return new Response(filtered, {
    status: resp.status,
    statusText: resp.statusText,
    headers: resp.headers,
  });
}
```

集成建议：

- 若仍使用 `fetch` 包装（如 `authorized-fetch`）：
  1. 让支付客户端优先完成支付帧消费与结算（或采用轮询）。
  2. 在返回给上层前调用 `stripPaymentFrames()`，保证上层只看到“纯业务流”。
- 推荐直接使用 `PaymentChannelHttpClient.requestWithPayment`：
  - 非流：返回 `PaymentResult<T>`。
  - 流：返回 `PaymentResult<Response>`。SDK 内部先处理支付帧/轮询，再使用上面的过滤器将 `Response` 交给上层应用。

---

### 方案三（可选）：HTTP Trailers

在响应开始前设置 `Trailer: X-Payment-Channel-Data`，流结束时通过 `res.addTrailers({ 'X-Payment-Channel-Data': '<payload>' })` 写入结算结果。

局限：

- 浏览器 Fetch 对 Trailer 支持有限；中间层/代理可能丢弃 Trailer；跨端可移植性差。
- 不作为默认方案，仅在特定受控环境可考虑。

---

### 路由与配置变更建议

- `RouteOptions` 新增：

  - `streaming?: boolean`（标识路由是流式输出；用于服务端禁用 `on-headers` 写入策略）

- `ExpressPaymentKitOptions` 新增：
  - `streamingBillingMode?: 'auto' | 'polling' | 'inband' | 'trailers'`
    - 默认 `auto`：优先 `polling`；若显式选择 `inband`/`trailers`，则采用对应实现。

---

### 服务端示例（SSE，伪代码）

```ts
// 路由注册（启用 deferred 策略 + streaming 标记）
kit.get(
  '/chat/stream',
  { strategy: { type: 'PerToken', unitPricePicoUSD: '5000' }, streaming: true },
  async (req, res) => {
    res.setHeader('Content-Type', 'text/event-stream');
    res.setHeader('Cache-Control', 'no-cache');
    res.flushHeaders?.();

    // 使用量收集器（示意 API）
    const billing = createStreamBillingHelpers(res);

    for await (const chunk of generateTokens()) {
      // 累计 tokens 用量
      billing.addUsage(chunk.tokenCount);
      res.write(`data: ${JSON.stringify({ token: chunk.text })}\n\n`);
    }

    // 可选：手动触发结算（否则在 finish/close 自动结算）
    await billing.finalize();
    res.end();
  }
);
```

结算查询接口（内置）：

```http
GET /payment-channel/payments/:clientTxRef
Accept: application/json

200 OK
{ "success": true, "data": { "subRav": { ... }, "cost": "1234", "costUsd": "5678", "clientTxRef": "...", "serviceTxRef": "...", "version": 1 } }
```

---

### 客户端示例（后台轮询，伪代码）

```ts
const handle = await httpClient.createRequestHandle('GET', '/chat/stream');

// 读取流同时，后台等待结算
const reader = (await handle.response).body!.getReader();
// 同时：handle.payment 在后台通过轮询 /payments/:clientTxRef 获取并解析

const { payment } = await handle.done; // data: Response, payment: PaymentInfo | undefined
```

---

### 兼容性与迁移

- 非流式端点不受影响，仍通过响应头携带结算信息。
- 流式端点建议：
  - 标注 `streaming: true`，启用延迟计费策略（`deferred=true`）。
  - 若已有业务层“token 计数”，可直接回调 `addUsage()`。
  - 无法准确计数时，可退化为“按分块数估算”或定义业务自定义单位。

---

### 实施清单（按优先级）

1. 服务端：

   - 在 `ExpressPaymentKit.ts` 增加 `streaming` 分支：禁用 `on-headers` 写头，改为 `finish/close` 时结算并持久化。
   - 新增 `SettlementRepository` 接口与实现（Memory + SQL）。
   - 增加内置路由 `GET {basePath}/payments/:clientTxRef`。
   - 提供 `createStreamBillingHelpers(res)` 的最小实现，封装使用量累加与 finalize。

2. 客户端：

   - `PaymentChannelHttpClient.ts` 在 `handleResponse()` 无协议头且判断为流式时，启动对 `/payments/:clientTxRef` 的后台轮询（指数退避，受 `timeoutMs` 约束）。
   - 成功后按现有成功分支处理，失败/超时按现有 onError 处理。
   - 可选：支持解析“流内支付帧”。

3. 文档与示例：
   - 在 `llm-gateway` 集成文档中标注如何开启 `streaming` 与如何累计使用量。

---

### 备注

- 若未来浏览器与代理对 HTTP Trailers 的兼容性提升，可将 `trailers` 作为可选优化路径集成。
- 若业务希望“首包即写头”，应选择非延迟策略（如固定单价的 `PerRequest`）或在首包前可得知完整使用量的情形。
