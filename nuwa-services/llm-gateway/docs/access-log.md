## Access Log 设计方案（PaymentKit 版，先仅 stdout）

> 前提与范围
> - 已移除旧分支：PaymentKit 始终开启，DID 鉴权由 PaymentKit 完成。
> - 本方案先不落库，只输出结构化 JSON 到 stdout；后续再接入数据库/日志平台。

### 目标
- 为每次请求生成一条可检索的 access_log，便于排障与归因。
- 覆盖非流式与流式（SSE）两类请求，不阻塞主链路。
- 明确字段、采集点与脱敏策略；支持后续平滑扩展（DB/采样/批量写）。

### 字段清单（建议最小集）
- 请求维度
  - `request_id`：= `client_tx_ref`（优先使用 PaymentKit 值；无则用临时 uuid 占位并同步回写 `X-Request-Id`）
  - `client_tx_ref`：从请求头解析；如无则与 `request_id` 同值（临时 uuid）
  - `server_tx_ref`：从响应头或流内支付帧解析
  - `fallback_request_id`：仅当使用临时 uuid 时记录占位值
  - `request_time`、`response_time`、`duration_ms`
  - `method`、`path`、`query`（JSON）
  - `is_stream`（来自请求体 `stream` 或路由判断）
  - `client_ip`、`user_agent`、`referer`
  - `request_body_size`（来自 `content-length`，不存请求体）
- 身份与路由
  - `did`（PaymentKit 鉴权注入的 `req.didInfo.did`）
  - `provider`（`openrouter`/`litellm`，以实际选路为准）
- 业务与用量
  - `model`（从请求体提取，缺省 `unknown`）
  - `input_tokens`、`output_tokens`、`total_cost_usd`（数字；单位统一 USD）
  - `usage_source`：`body` | `header` | `stream`（标明成本来源）
- 上游与响应
  - `status_code`（返回给客户端的状态码）
  - `upstream_status_code`、`upstream_error`（有错时记录简要文本）
  - `response_bytes`（非流式取 JSON 长度；流式累计字节数）
  - `req_headers_subset`、`res_headers_subset`（脱敏后的关键头部快照）
- 错误信息
  - `error_stage`（`auth` | `provider_select` | `forward` | `stream` | `finalize`）
  - `error_message`（不含密钥/长文本）

— 上游（Upstream）
  - `upstream_name`：`openrouter` | `litellm`
  - `upstream_method`、`upstream_path`（转发的纯路径，如 `/chat/completions`）
  - `upstream_status_code`
  - `upstream_duration_ms`（仅上游调用耗时）
  - `upstream_request_id`（如 `x-request-id`/`x-openai-request-id` 等）
  - `upstream_headers_subset`：
    - 速率：`x-ratelimit-limit`、`x-ratelimit-remaining`
    - 计费：`x-usage`（OpenRouter）、`x-litellm-response-cost`（LiteLLM，若有）
  - `upstream_streamed`（是否流式）
  - `upstream_bytes`（从上游读取的字节数，流式累计）
  - `upstream_cost_usd`（若能从头/体解析出单次成本）

脱敏与体积控制：
- 永不记录 `Authorization`、`Set-Cookie`、API Key 等敏感原文；仅记录存在性或哈希（如确需）。
- 只保存头部子集与长度信息，不保存请求体/响应体内容。

### 采集方式与接入点
整体思路：在最前链路加一个轻量中间件初始化 `res.locals.accessLog`；计费/鉴权细节全部由 PaymentKit 处理并在 `res.locals.billingContext` 填充所需字段（如 `meta.clientTxRef`、`state.headerValue`、`state.serviceTxRef`、`state.cost`/`state.costUsd` 等），Access Log 只读取，不重复解析协议头；统一在 `finish/close` 时异步输出。

1) 顶层中间件（进入最早位置）
- 位置：`src/index.ts` 中 CORS/JSON 解析后，`await initPaymentKitAndRegisterRoutes(app)` 之前。
- 作用：
  - 不解析 Payment 头。尽量从 `req.headers['x-client-tx-ref']` 获取 `client_tx_ref`（若客户端直传），否则先生成临时 uuid 占位；最终以 PaymentKit 在 `res.locals.billingContext` 填充的值为准覆盖。
  - 将 `request_id`（占位）写入 `res.locals.accessLog`，并回写响应头 `X-Request-Id`（若后续拿到 `client_tx_ref`，仅用于日志覆盖，不强制再回写）。
  - 初始快照：`request_time`、`method`、`path`、`query`、`client_ip`、`user_agent`、`request_body_size`、`is_stream`、`req_headers_subset`（如 `content-type`、`x-llm-provider`）。
  - 监听 `finish`/`close` 做统一收尾：
    - 优先使用 PaymentKit 在 `res.locals.billingContext` 中提供的数据：
      - `meta.clientTxRef` 作为 `client_tx_ref`/`request_id`
      - `state.serviceTxRef` 作为 `server_tx_ref`
      - `state.costUsd`（若存在）或 `state.cost`（picoUSD，可换算）
    - 如缺失再兜底：非流式从响应头 `X-Payment-Channel-Data` 解析 `server_tx_ref`；流式从 in-band 支付帧解析；
    - 统一计算 `duration_ms`、填充 `status_code`、`res_headers_subset`、输出 JSON。
8) 从 BillingContext 提取关键信息（推荐）
- `res.locals.billingContext.meta.clientTxRef` → `client_tx_ref`/`request_id`
- `res.locals.billingContext.state.serviceTxRef` → `server_tx_ref`
- `res.locals.billingContext.state.headerValue` → 已编码的 Payment 响应头（如需）
- `res.locals.billingContext.state.costUsd` 或 `state.cost`（picoUSD，需要除以 1e12 转 USD）→ 计费成本（可选冗余记录）
- 其他：`meta.operation`/`meta.path`/`meta.method`/`meta.billingRule`（可用于审计或路由归因）


2) 鉴权阶段（由 PaymentKit 完成）
- PaymentKit 使用 DIDAuthV1 鉴权并在 `req.didInfo` 注入 DID。
- 在进入业务处理前（或业务处理内）补：`did`。

3) Provider 选择与模型解析（业务处理内）
- 选路点（本仓库 `gateway.ts` 内已有 `resolveProvider`）：补 `provider`。
- 从请求体提取 `model` 与 `is_stream`（若未在顶层判定）。

4) 用量与成本
- 非流式：
  - OpenRouter：沿用 `parseResponse()`，读取 `body.usage.cost` 或 `x-usage` 头；填 `total_cost_usd`、`usage_source='body'|'header'`。如能拿到 tokens 也填入。
  - LiteLLM：如后续从响应头取到 `x-litellm-response-cost`（或约定），填 `total_cost_usd`，标 `usage_source='header'`。
- 流式：
  - 已在 `gateway.ts` SSE 分支解析包含 `"usage"` 的行并累计成本；在 `end`/`[DONE]` 时写回 `res.locals.usage`。
  - 同时在 `data` 事件中累计 `response_bytes`，在 `end/close` 时回填。

5) 错误采集
- 上游错误对象存在时：记录 `upstream_status_code` 与 `upstream_error`，并标 `error_stage`。
- 本地异常：记录 `error_stage` 与 `error_message`；不包含堆栈/敏感信息。

6) 统一收尾（只执行一次）
- 钩子：`res.on('finish')` 与 `res.on('close')`，用原子标记避免重复。
- 动作：计算 `response_time`、`duration_ms`，采集 `status_code`、`res_headers_subset`、`response_bytes`，拼装并 `console.log(JSON.stringify({...}))`。

7) 上游字段采集要点
- 在发起上游请求前后（`provider.forwardRequest` 调用处）打点，计算 `upstream_duration_ms`。
- 记录 `upstream_name`（来自路由选路结果），`upstream_method`（转发方法）、`upstream_path`（规范化后传给 provider 的路径）。
- 非流式：从 `response.headers` 抽取 `x-usage`、`x-ratelimit-*`、`x-request-id`，若有 `x-litellm-response-cost` 也记录；`upstream_status_code = response.status`。
- 流式：在 `data` 回调里累计 `upstream_bytes`；在 `end` 时落 `upstream_status_code` 与 `upstream_duration_ms`；如在 SSE 尾块解析到 `usage.cost` 则填充 `upstream_cost_usd`。
- 异常：将上游异常的简要文本写入 `upstream_error`，状态码用捕获到的 `error.response.status`（若存在）。

### 中间件骨架（最小示例：不重复解析，读取 res.locals.billingContext，仅 stdout）
```ts
// src/middleware/accessLog.ts
import { v4 as uuidv4 } from 'uuid';
import type { Request, Response, NextFunction } from 'express';

export function accessLogMiddleware(req: Request, res: Response, next: NextFunction) {
  const start = process.hrtime.bigint();
  // 不解析 Payment 头：若有显式 X-Client-Tx-Ref 则使用，否则占位
  const clientTxRef = (req.headers['x-client-tx-ref'] as string | undefined) || uuidv4();
  res.setHeader('X-Request-Id', clientTxRef);

  res.locals.accessLog = {
    request_id: clientTxRef,
    client_tx_ref: clientTxRef,
    request_time: new Date().toISOString(),
    method: req.method,
    path: req.path,
    query: req.query,
    is_stream: !!(req.body && (req.body as any).stream),
    client_ip: req.ip,
    user_agent: req.headers['user-agent'],
    referer: req.headers['referer'],
    request_body_size: Number(req.headers['content-length'] || 0),
    req_headers_subset: {
      'content-type': req.headers['content-type'],
      'x-llm-provider': req.headers['x-llm-provider'],
    },
  } as any;

  let finalized = false;
  const finalize = () => {
    if (finalized) return; finalized = true;
    const end = process.hrtime.bigint();
    const durationMs = Number(end - start) / 1e6;
    const log = res.locals.accessLog || {};
    // 覆盖为 PaymentKit 实际值（若已填充）— 从 res.locals.billingContext 读取
    try {
      const bc = (res as any).locals?.billingContext;
      const ctxClient = bc?.meta?.clientTxRef;
      const ctxServer = bc?.state?.serviceTxRef;
      if (ctxClient) {
        log.client_tx_ref = ctxClient;
        log.request_id = ctxClient;
      }
      if (ctxServer) {
        log.server_tx_ref = ctxServer;
      }
      // 可选：记录成本（若存在且为 USD 数值）
      if (typeof bc?.state?.costUsd === 'number') {
        log.total_cost_usd = bc.state.costUsd;
      }
    } catch {}
    log.response_time = new Date().toISOString();
    log.duration_ms = Math.round(durationMs);
    log.status_code = res.statusCode;
    // 兜底：必要时可解析响应头（建议保留为 fallback，但默认不开启）
    log.res_headers_subset = {
      'content-type': res.getHeader('content-type'),
      'x-usage': res.getHeader('x-usage'),
    };
    try {
      // stdout 结构化日志
      // 注意：不要打印敏感字段；如需进一步脱敏，可在此处处理
      console.log(JSON.stringify({ type: 'access_log', ...log }));
    } catch {}
  };

  res.on('finish', finalize);
  res.on('close', finalize);
  next();
}
```

接入位置（示例）：
```ts
// src/index.ts
// ... after app.use(cors()) and app.use(express.json())
import { accessLogMiddleware } from './middleware/accessLog.js';
app.use(accessLogMiddleware);

// PaymentKit 注册（始终开启）
await initPaymentKitAndRegisterRoutes(app);
```

业务处理内补充字段（建议）：
- 选路后：`res.locals.accessLog.provider = providerName`。
- 解析请求体：`res.locals.accessLog.model = req.body?.model || 'unknown'`。
- 非流式完成响应前：将 `usage.cost`（USD）与 tokens 写入 `res.locals.accessLog`，并设置 `usage_source`。
- 流式：在 `data` 累计 `response_bytes`，在 `end/[DONE]/close` 前写 `total_cost_usd` 与 `usage_source='stream'`。

### 输出样例
```json
{
  "type": "access_log",
  "request_id": "cltx_01JABCDXYZ...",
  "client_tx_ref": "cltx_01JABCDXYZ...",
  "server_tx_ref": "svtx_01JABCDE123...",
  "request_time": "2025-07-01T10:00:00.000Z",
  "response_time": "2025-07-01T10:00:00.420Z",
  "duration_ms": 420,
  "method": "POST",
  "path": "/api/v1/chat/completions",
  "query": {},
  "is_stream": false,
  "client_ip": "::1",
  "user_agent": "curl/8.4.0",
  "did": "did:rooch:...",
  "provider": "openrouter",
  "model": "openrouter/xyz",
  "status_code": 200,
  "upstream_name": "openrouter",
  "upstream_method": "POST",
  "upstream_path": "/chat/completions",
  "upstream_status_code": 200,
  "upstream_duration_ms": 380,
  "upstream_request_id": "req_abc123",
  "upstream_headers_subset": {"x-usage":"{...}","x-ratelimit-limit":"60","x-ratelimit-remaining":"59"},
  "upstream_streamed": false,
  "upstream_bytes": 2048,
  "upstream_cost_usd": 0.000142,
  "input_tokens": 12,
  "output_tokens": 85,
  "total_cost_usd": 0.000142,
  "usage_source": "body",
  "request_body_size": 256,
  "response_bytes": 1024,
  "req_headers_subset": {"content-type":"application/json","x-llm-provider":"openrouter"},
  "res_headers_subset": {"content-type":"application/json","x-usage":"{...}"}
}
```

### 配置项（预留，先默认全量输出）
- `ACCESS_LOG_ENABLED=true|false`（默认 `true`）
- `ACCESS_LOG_SAMPLE_RATE=1.0`（0~1）
- `ACCESS_LOG_REDACT_HEADERS=Authorization,Set-Cookie`
- `ACCESS_LOG_TO_STDOUT=true|false`（默认 `true`）

### 后续扩展（非本次范围）
- 落库 Supabase/Postgres（新表 `access_logs`），与 `request_logs` 用 `request_id` 关联。
- 增加批量写与失败重试；对接集中日志/可观测平台（如 Loki/ELK）。
- 为流式错误透传定义 `event: error` SSE 帧规范，便于前端感知与排障。


