## MCP 集成方案设计（Server 与 Client）

> 目标：在不破坏现有 HTTP 集成（`ExpressPaymentKit` 与 `PaymentChannelHttpClient`）的前提下，为 MCP（Model Context Protocol）提供等价能力：按操作计费、延迟结算（Deferred Billing）、可选流式结算、DID 鉴权与通道恢复，同时最大化复用现有模块（`PaymentProcessor`、存储与计价）并尽量最小重构。

### 1. 背景与差异

- HTTP 集成采用请求头/响应头承载协议数据（`X-Payment-Channel-Data`），流式响应通过 SSE/NDJSON 注入帧；
- MCP 属于 JSON-RPC 语义（stdio / TCP / WebSocket 等传输），无 HTTP Header。逐次调用需将支付与鉴权数据放在每次调用的 `params` 中（保留键），服务端在 `result` 或通知中回写结算数据；
- MCP 可能存在「方法调用」与「工具流式增量输出」两类交互，需要提供与 HTTP 类似的「前置/后置计费」与「流式内联结算帧」能力。

核心映射：

- HTTP Header → MCP Request `params.__nuwa_payment`（请求）/ MCP Result `result.__nuwa_payment`（响应）/ 或内联帧；
- DIDAuthV1 Authorization Header → MCP Request `params.__nuwa_auth`（逐次鉴权）；
- 路由匹配（method+path）→ MCP 操作名称（`operation = "MCP:<method>"` 或 `MCP:<toolName>`）。

### 2. 总体架构

- Server 侧（MCP）：

  - `McpPaymentKit`（类比 `ExpressPaymentKit`）：提供「声明计费规则 + 注册内置/业务处理器 + DID 鉴权 + 计费编排 + 结果注入」的一体化封装；
  - `McpBillingMiddleware`：协议适配层，负责从 MCP 请求中提取/写回支付元数据，调用通用 `PaymentProcessor` 完成「验证→计价→发券→持久化」；
  - 编解码复用：使用现有 `HttpPaymentCodec` 作为统一编解码；在 MCP 层用轻量 codecAdapter 将 params/result 与 headerValue（字符串）互转；
  - 内置 MCP 方法：`nuwa.discover`、`nuwa.health`、`nuwa.recovery`、`nuwa.commit`、`nuwa.admin.claims`（类比 HTTP 内置 Handler）。

- Client 侧（MCP）：
  - `PaymentChannelMcpClient`（类比 `PaymentChannelHttpClient`）：
    - 负责 DIDAuth 头（元数据）生成与注入；
    - 负责 SubRAV 的消费、签名与缓存；
    - 为每个请求分配 `clientTxRef` 并在响应解析时对齐；
    - 支持Deferred Billing与流式内联帧解析；
    - 提供 `requestWithPayment`、`requestAndWaitForPayment` 等一致 API；
  - 发现与管理：通过 `nuwa.discover` 获取 `serviceDid` 与 `baseNamespace`（可选），用于自动开通道与恢复。

### 3. 数据承载规范（MCP Payment Codec）

为保持与 HTTP 版一致的语义，定义 MCP 侧请求/响应承载结构（不依赖非标准 meta，直接放入 params/result）：

- Request（发送自客户端 → 服务端）：

```ts
type McpPaymentRequestParams = {
  // 逐次鉴权（可选，按规则需要时必填）
  __nuwa_auth?: string; // "DIDAuthV1 <...>"

  // 支付协议负载（与 HTTP Header 等价）
  __nuwa_payment?: {
    version: 1;
    clientTxRef: string; // 必填：请求相关性标识
    maxAmount?: string; // 可选：最⼤可接受金额（asset 最小单位，字符串表示）
    signedSubRav?: {
      /* SignedSubRAV (JSON/hex/base64) */
    };
  };

  // ...业务参数
};
```

- Response（服务端 → 客户端）：

```ts
type McpPaymentResponseResult<TData = any> = {
  data: TData; // 业务返回
  __nuwa_payment?: {
    version: 1;
    clientTxRef?: string; // 回显
    serviceTxRef?: string; // 服务端事务 ID
    subRav?: {
      /* SubRAV */
    }; // 下一次待签名的 SubRAV 提案
    cost?: string; // 本次结算金额（asset 最小单位，字符串表示）
    costUsd?: string; // 对应 pUSD（字符串）
    error?: { code: string; message?: string };
  };
};
```

流式场景（如工具输出流）：

- 采用与 HTTP 相同的「内联结算帧」思想，但载体改为：
  - JSON-RPC 通知：`{"method":"nuwa/payment","params":{"headerValue":"<encoded>"}}`；或
  - 在流式增量 `result` 内插入单行对象：`{"__nuwa_payment_header__":"<encoded>"}`；
- `headerValue` 由 `HttpPaymentCodec.buildResponseHeader(...)` 生成，客户端用 `HttpPaymentCodec.parseResponseHeader(...)` 解析。

### 4. Server 端设计

#### 4.1 关键组件

- `McpPaymentKit`：

  - 负责：
    - 构造 `PaymentChannelPayeeClient`、`RateProvider`、`HubBalanceService`、`ClaimTriggerService`；
    - 创建「可计费路由器」并注册内置/业务方法；
    - 挂载 `McpBillingMiddleware`，统一处理鉴权、计费、结算与持久化；
  - 对标 `ExpressPaymentKit`：初始化、内置 handler 注册、默认资产/价格、adminDid 管控等均保持一致；

- `McpBillingMiddleware`：

  - 输入：MCP 调用上下文 `{ method: string; params: McpPaymentRequestParams }`；
  - 输出：
    - 非流式：在 `result.__nuwa_payment` 写入结算数据；
    - 流式：在增量流末尾或通过通知写入内联帧；
  - 过程：
    1. 从 `params.__nuwa_payment` 与 `params.__nuwa_auth` 提取支付与鉴权数据（DIDAuthV1）→ `PaymentProcessor.preProcess()`；
    2. 若前置错误（如 402/409 等），直接构造 `error.nuwa_payment` 返回；
    3. 调用业务处理器；
    4. 计算使用量（若是后置策略），`settle()` 得到 headerValue / next SubRAV；
    5. 将支付数据注入响应（或流式内联帧），`persist()` 持久化；

- `McpPaymentCodec`：
  - 与 `HttpPaymentCodec` 对齐接口，提供：
    - `encodePayload()`/`decodePayload()`（请求侧）
    - `encodeResponse()`/`decodeResponse()`（响应侧）
    - `buildRequestMeta()`/`parseRequestMeta()`、`buildResponseMeta()`/`parseResponseMeta()`

#### 4.2 规则匹配与路由

- 复用 `billing/core` 的规则匹配（基于 `BillingRule` 与 `findRule()`），仅需把 MCP 操作映射为统一 `operation`：
  - 例如：`operation = "MCP:" + method`（或按工具前缀 `MCP:tool/<name>`）
  - `BillableRouter` 可继续复用（它只依赖 `operation`/`path`/`method` 元信息），也可提供一个轻量映射适配器。

#### 4.3 DID 鉴权与 Admin 权限

- 复用 `DIDAuth.v1.verifyAuthHeader()`（`@nuwa-ai/identity-kit`）；
- 将鉴权信息设置到请求上下文（`didInfo`）；
- Admin 检查逻辑沿用 `ExpressPaymentKit.performAdminAuth()` 的等价实现（仅改为读取 MCP meta）。

#### 4.4 FastMCP 接入要点（推荐 Server 实现）

- 推荐使用 FastMCP 作为 MCP Server 宿主（参考 `nuwa-kit/typescript/examples/mcp-server/src/index.ts`）。
- 认证策略：
  - 推荐仅按「每次 tool 调用」进行逐次鉴权（匿名工具可不带鉴权，受路由规则控制）；
  - 可选会话级鉴权：在 `authenticate(request)` 一次性验证 `Authorization`，将 `{ did }` 放入 `context.session`，用于轻量审计与兜底；付费/敏感方法仍要求 `params.__nuwa_auth`；
- 工具注册：
  - `server.addTool({ name, parameters, execute })` 外层包一层 `McpBillingMiddleware` 调用：
    - 执行前：`preProcess()`（含规则匹配、签名 SubRAV 校验、FREE 检查等）；
    - 执行后：根据策略（前置/后置）执行 `settle()`，并将结算数据注入返回；
    - 持久化：`persist()`；
  - 业务处理器无需关心支付细节，仅在「后置计费」时提供使用量（如 token 数）；
- 流式：
  - 若宿主支持通知，优先发送 `nuwa/payment` 通知（载荷 `{ headerValue }`）；
  - 否则在流尾插入 `{"__nuwa_payment_header__":"<encoded>"}` 单行对象；
- 示例（骨架）：

```ts
// createFastMcpPaymentKit.ts（示意）
import { FastMCP } from 'fastmcp';
import { McpPaymentKit } from '@nuwa-ai/payment-kit';

export async function createFastMcpPaymentKit(server: FastMCP, opts: McpPaymentKitOptions) {
  const kit = await createMcpPaymentKit(opts); // 构建 PayeeClient/Processor 等

  // 统一鉴权（与示例一致）
  server.configure({
    authenticate: async request => {
      const header = request.headers?.get?.('authorization') ?? request.headers?.authorization;
      // 调 DIDAuth 验证…
      return { did: '<resolved-did>' };
    },
  });

  // 注册内置方法
  for (const [name, handler] of Object.entries(kit.getHandlers())) {
    server.addTool({
      name,
      description: 'nuwa internal',
      parameters: z.any(),
      async execute(params, context) {
        // 包装 MCP → Billing 中间件
        return kit.execute(name, params, { meta: context, streaming: false });
      },
    });
  }

  return kit;
}
```

### 5. Client 端设计

#### 5.1 关键能力

- `PaymentChannelMcpClient`：
  - 与 `PaymentChannelHttpClient` 接口保持一致（`requestWithPayment`/`requestAndWaitForPayment`/`get`/`post` 等可按 MCP 语义命名为 `call`/`notify`）；
  - 统一「Deferred Billing」：首次请求 FREE，收到服务端返回的 SubRAV 提案后，于下一次调用附带签名；
  - 每次请求生成/传播 `clientTxRef`，解析响应/内联帧以完成支付对账；
  - 支持流式：拦截增量，过滤 `__nuwa_payment_header__` 或订阅 `nuwa/payment` 通知；
  - 通道生命周期：
    - `ensureKeyFragment()`、`ensureChannelReady()`、`recoverFromService()` 与 HTTP 版复用；
  - 存储：
    - 继续复用 `HostChannelMappingStore`、`ChannelRepository`、`TransactionStore`。

#### 5.2 发现与内置方法

- `discoverService()`：调用 `nuwa.discover` 获取 `serviceDid`/`defaultAssetId`/`baseNamespace`；
- `healthCheck()`：`nuwa.health`；
- `recoverFromService()`：`nuwa.recovery`；
- `commitSubRAV()`：`nuwa.commit`。

#### 5.3 AI SDK 接入要点（推荐 Client 实现）

- 推荐使用 Vercel AI SDK `experimental_createMCPClient` 与 `StreamableHTTPClientTransport`（参考 `nuwa-kit/typescript/examples/mcp-client/src/index.ts`）。
- 认证：
  - 推荐逐次鉴权：将 DIDAuthV1 放入 `params.__nuwa_auth`，不依赖 per-request header；
  - 可选会话级头：`StreamableHTTPClientTransport` 建连时可放置一次性 `Authorization`，仅作兜底身份；
- 支付元数据：
  - 在 `params.__nuwa_payment` 写入 `clientTxRef/maxAmount/signedSubRav`；
  - 流式：监听 `nuwa/payment` 通知或过滤增量中的 `__nuwa_payment_header__`；
- 示例（骨架）：

```ts
// PaymentChannelMcpClient（示意）
const transport = new StreamableHTTPClientTransport(new URL(baseUrl), {
  requestInit: { headers: { Authorization: staticAuthHeader } },
} as any);
const client = await experimental_createMCPClient({ transport });

// 包装 call：
const clientTxRef = crypto.randomUUID();
const params = {
  ...userParams,
  __nuwa_auth: didAuthV1Token,
  __nuwa_payment: { version: 1, clientTxRef, maxAmount, signedSubRav },
};
const result = await client.tools()[method].execute(params);
// 解析 result.__nuwa_payment 或等待通知，完成支付解析与对账
```

### 6. 可复用模块与最小重构

可直接复用：

- 核心账务与校验：`PaymentProcessor`、`RavVerifier`、`SubRAVCodec/Signer/Validator`、`ClaimTriggerService`、`HubBalanceService`；
- 合约与计价：`IPaymentChannelContract`、`RoochPaymentChannelContract`、`ContractRateProvider`；
- 存储：`ChannelRepository`、`RAVRepository`、`PendingSubRAVRepository`、`TransactionStore`；
- 工具与类型：`PaymentUtils`、`core/types`、`errors`、`schema`。

建议的最小重构：

- 强化 `PaymentCodec` 接口（`src/codecs/PaymentCodec.ts` 现为占位）：

```ts
export interface PaymentCodec {
  // 请求侧
  encodePayload(payload: PaymentHeaderPayload): string | Record<string, any>;
  decodePayload(input: string | Record<string, any>): PaymentHeaderPayload;

  // 响应侧
  encodeResponse(
    subRAV: SubRAV,
    cost: bigint,
    serviceTxRef: string,
    metadata?: any
  ): string | Record<string, any>;
  decodeResponse(input: string | Record<string, any>): HttpResponsePayload; // 复用命名，含 error/subRav/cost
}
```

- 引入「协议中间件基类」以复用框架逻辑：

  - 现有 `HttpBillingMiddleware` 与未来 `McpBillingMiddleware` 共享「构建 `BillingContext` → `PaymentProcessor` → 写回载体」的主流程；
  - 提取通用流程到 `AbstractBillingMiddleware`（协议无关），各协议实现只需：
    - `extractPaymentData()`、`injectSettlement()`、`isStreaming()`、`writeInBandFrame()`。

- `BillableRouter` 不改动或仅加 `register(name, options, handler)` 的轻量别名；匹配仍由 `billing/core/rule-matcher.ts` 完成。

- 新增 `codecAdapter` 轻量 helper（可选），把 `params.__nuwa_payment` 与 `headerValue` 互转，便于与 `HttpPaymentCodec` 协同；

### 7. 错误语义与兼容

- 协议层错误：沿用 `PaymentErrorCode`；
- MCP JSON-RPC 错误承载：在 `error.data.nuwa_payment` 放置 `error.code/message/clientTxRef/version`；
- FREE 回退：若服务端未返回支付元数据，客户端按 FREE 处理，清理 pending 并继续；
- 冲突与资金不足：
  - `RAV_CONFLICT` → 客户端清空 pendingSubRAV 并重试；
  - `PAYMENT_REQUIRED` → 客户端提示充值/补款（复用 `PaymentHubClient`）。

### 8. 流式处理

- Server：业务端标记 `streaming: true`（与 HTTP 一致的路由开关）；
- 结算触发点：
  - 非流式：在业务处理完成后同步注入；
  - 流式：
    - 优先采用通知 `nuwa/payment`；若底层不便通知，则在流尾插入 `{"__nuwa_payment_header__": "..."}`；
- Client：
  - 包装流，过滤支付帧并回填 `payment`；
  - 若没有支付帧，完成后走恢复路径（与 HTTP 一致）。

### 9. API 草案（关键类型与入口）

Server：

```ts
// packages/payment-kit/src/transport/mcp/McpPaymentKit.ts
export interface McpPaymentKitOptions {
  serviceId: string;
  signer: SignerInterface;
  network?: 'local' | 'dev' | 'test' | 'main';
  rpcUrl?: string;
  defaultAssetId?: string;
  defaultPricePicoUSD?: string | bigint;
  adminDid?: string | string[];
  debug?: boolean;
}

export interface McpPaymentKit {
  // 暴露 MCP 方法注册接口，底层复用 BillableRouter 规则
  register(
    name: string,
    options: RouteOptions, // 直接复用 Express 版的 RouteOptions
    handler: (params: any, meta?: any) => Promise<any>,
    ruleId?: string
  ): this;

  // 将所有已注册方法导出为 MCP 服务器可用的 handler 映射
  getHandlers(): Record<string, (params: any, meta?: any) => Promise<any>>;
}
```

Client：

```ts
// packages/payment-kit/src/integrations/mcp/PaymentChannelMcpClient.ts
export class PaymentChannelMcpClient {
  constructor(options: McpPayerOptions /* 与 HttpPayerOptions 对齐，替换 fetch 为 call/notify */) {}

  async call<T = any>(method: string, params?: any, meta?: any): Promise<PaymentResult<T>> {}
  async notify(method: string, params?: any, meta?: any): Promise<void> {}

  // 与 HTTP 客户端一致的公共 API
  getPendingSubRAV(): SubRAV | null {}
  clearPendingSubRAV(): void {}
  getChannelId(): string | undefined {}
  getPayerClient(): PaymentChannelPayerClient {}
  getHubClient(): PaymentHubClient {}
}
```

### 10. 任务拆解与文件清单

新增文件：

- `src/transport/mcp/McpPaymentKit.ts`（Server 封装）
- `src/middlewares/mcp/McpBillingMiddleware.ts`（协议中间件）
- `src/integrations/mcp/PaymentChannelMcpClient.ts`（Client 封装）
- `src/integrations/mcp/internal/codecAdapter.ts`（可选：结构化 params ↔ headerValue 互转）
- `src/transport/mcp/HandlerMcpAdapter.ts`（将内置 `api/handlers/*` 适配为 MCP 方法）

可选重构/抽象：

- `src/middlewares/AbstractBillingMiddleware.ts`（提取协议无关流程）
- 强化 `src/codecs/PaymentCodec.ts` 接口，并让 `HttpPaymentCodec`/`McpPaymentCodec` 实现它

测试：

- 单元：`codecAdapter`、`McpBillingMiddleware`、`PaymentChannelMcpClient` 的请求-响应与流式帧解析；
- 集成：复用 E2E 思路，构造内存传输的 MCP 服务器，跑完整的延迟结算用例（FREE → 付费 → 触发 claim）。

### 11. 风险与兼容性

- 传输多样性（stdio/WebSocket/TCP）：客户端与服务端需保持对「meta 载体」与「内联帧」的抽象，不绑定具体传输；
- 流式路径的尾部注入可能与上游实现冲突，优先采用通知 `nuwa/payment`；
- 与现有 HTTP 并存：不修改 `PaymentProcessor`/`billing`/`storage` 的外部接口，新增协议层实现，避免破坏性变更。

### 12. 小结

- 通过在协议层引入 `McpBillingMiddleware` 并复用 `HttpPaymentCodec`（配合轻量 adapter），复用现有 `PaymentProcessor`/存储/计价/触发器，快速获得 MCP 端到端计费与支付通道能力；
- 仅对 `PaymentCodec` 做小幅增强、可选提取中间件基类，即可在 HTTP 与 MCP 之间共享 80%+ 的主流程代码；
- Client/Server 两端 API 与行为完全对齐 HTTP 版本，降低迁移与维护成本。
