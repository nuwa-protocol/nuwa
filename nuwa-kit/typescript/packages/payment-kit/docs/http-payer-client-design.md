# HTTP Payer Client Design

> 本文档旨在为 `payment-kit` 设计一套 **Payer 侧的 HTTP 高级封装**，让调用方无需关心 SubRAV 生成、签名、请求头格式、响应解析等细节即可完成延迟支付流程。

## 1. 设计目标

1. **开箱即用**：开发者只需要提供 `baseUrl`、链/签名相关配置（`payerClientConfig`）以及必要的身份信息就能立即发送带支付能力的 HTTP 请求。
2. **协议无关**：底层支付逻辑全部依赖于 `PaymentChannelPayerClient`，不绑定具体区块链或资产。
3. **最小侵入**：API 与 `fetch` 保持高度一致，方便集成到现有代码中。
4. **自动握手与续签**：首次请求自动完成 Handshake（nonce = 0, amount = 0）；后续请求根据 Server 返回的 unsigned SubRAV 自动签名并附加到下一次请求。
5. **错误处理**：对 402/409 等支付相关错误做集中处理，可配置重试或抛出异常。
6. **可扩展**：预留 Hook 供调用方注入自定义 Header、日志或 Metric。

## 2. 模块结构

```
PaymentChannelHttpClient
│
├─ internal/
│   ├─ SubRavCache        // 负责缓存上一轮 Server 提供的 unsigned SubRAV
│   ├─ DidAuthHelper      // 生成 DIDAuthV1 头的工具函数
│   └─ codec.ts          // re-export HttpPaymentCodec 便于内聚
│
└─ index.ts              // 暴露主类及类型
```

> 说明：实现文件将放置在 `src/integrations/http/` 目录下，命名为 `PaymentChannelHttpClient.ts`。

## 3. 核心类型

```typescript
export interface HttpPayerOptions {
  /** 创建底层 PaymentChannelPayerClient 所需参数 */
  payerClientConfig: PaymentChannelFactoryOptions;

  /** 目标服务根地址，如 https://api.example.com */
  baseUrl: string;

  /** 指定 channelId（可选）。如果为空将自动为当前 host 创建或查找活跃通道 */
  channelId?: string;

  /** 可选 DID，用于生成 Authorization 头 */
  payerDid?: string;

  /** DID KeyManager，用于签名 DIDAuth 对象 */
  keyManager?: SignerInterface;

  /** 默认每次能接受的最大费用，超出将拒绝付款 */
  maxAmount?: bigint;

  /** 是否打印 debug 日志 */
  debug?: boolean;

  /** 自定义错误处理函数 */
  onError?: (err: unknown) => void;

  /**
   * Host 与 channelId 映射存储，默认为 MemoryStore。
   * 浏览器运行时：建议使用 IndexedDB Store；
   * Node 运行时：可选 FileStore 或 RedisStore。
   */
  mappingStore?: HostChannelMappingStore;
}

/** Host 与 ChannelId 映射仓库 */
export interface HostChannelMappingStore {
  get(host: string): Promise<string | undefined>;
  set(host: string, channelId: string): Promise<void>;
  delete(host: string): Promise<void>;
}

export interface FetchLike {
  (input: RequestInfo | URL, init?: RequestInit): Promise<Response>;
}
```

## 4. 主类接口

```typescript
export class PaymentChannelHttpClient {
  constructor(options: HttpPayerOptions);

  /**
   * 发送带支付信息的 HTTP 请求（底层使用 fetch）。
   */
  async request(
    method: 'GET' | 'POST' | 'PUT' | 'DELETE' | 'PATCH',
    path: string,
    init?: RequestInit
  ): Promise<Response>;

  /** 语法糖包装 */
  get<T = any>(path: string, init?: RequestInit): Promise<T>;
  post<T = any>(path: string, body?: any, init?: RequestInit): Promise<T>;
  put<T = any>(path: string, body?: any, init?: RequestInit): Promise<T>;
  patch<T = any>(path: string, body?: any, init?: RequestInit): Promise<T>;
  delete<T = any>(path: string, init?: RequestInit): Promise<T>;

  /** 读取/清理内部缓存的 unsigned SubRAV */
  getPendingSubRAV(): SubRAV | null;
  clearPendingSubRAV(): void;
}
```

### 4.1 请求流程

0. **确保通道可用**

   1. 提取 `host`，查询 `mappingStore` 是否已有 `channelId`。
   2. 若无记录或通道已关闭，则使用内部 `PaymentChannelPayerClient` 自动调用 `openChannelWithSubChannel()` 创建新通道，并写回 `mappingStore`。

1. **准备 Header**

   - `Authorization`（可选）：调用 `DidAuthHelper` 基于 `payerDid` 生成 DIDAuthV1 头。
   - `X-Payment-Channel-Data`：
     - 若缓存的 `pendingSubRAV` 存在，则由内部 `payerClient.signSubRAV()` 签名并封装。
     - 若是第一次向该 host 发送请求（Handshake 场景）：构造 nonce=0、amount=0 的 SubRAV 并签名封装。

2. **发送请求**

   - 底层使用可注入的 `fetch`（默认全局 fetch）发起 HTTP 请求。

3. **处理响应**

   - 读取响应 Header 中的 `X-Payment-Channel-Data`（如果有）。
   - 若包含新的 unsigned `SubRAV`：
     - 保存到 `pendingSubRAV` 缓存，供下一次请求签名使用。
     - 可选：根据策略触发自动 commit（调用 service 的 `/payment/commit`）。
   - 返回解析后的业务 JSON（或原始 Response，取决于调用方法）。

4. **错误处理**
   - HTTP 402：余额不足 / 提案无效 -> 清理缓存并重试或抛错。
   - HTTP 409：SubRAV 冲突 -> 重新握手：清空 `pendingSubRAV` 并重发。
   - 其它网络或解析错误通过 `onError` 回调统一处理。

### 4.2 内部状态机

```
          create/open                handshake
┌────────────┐ ───────────► ┌──────────────┐ ───────────► ┌────────────┐
│   INIT     │             │  OPENING     │               │  READY     │
└────────────┘ ◄──────────┐ └──────────────┘ ◄─────────── │            │
         reset/409        │         | channel ok          └────────────┘
                          │         ▼
                          │   ┌──────────────┐
                          └───│  HANDSHAKE   │
                              └──────────────┘
```

- INIT：启动阶段，还未查询映射存储。
- OPENING：为目标 host 创建或恢复活跃通道。
- HANDSHAKE：通道就绪后，发送 nonce=0 的 SubRAV 与服务端完成首次绑定。
- READY：进入正常付款循环，每次消费后等待下一轮 unsigned SubRAV，若收到 409/重置指令则回到 HANDSHAKE。

### 4.3 Host → ChannelId 映射策略

| 场景              | 建议实现                                                                          |
| ----------------- | --------------------------------------------------------------------------------- |
| 浏览器            | `IndexedDBMappingStore`：持久化到 IndexedDB，优点是异步、容量大，缺点是实现稍复杂 |
| Node.js 小型脚本  | `MemoryMappingStore`：进程内 Map 实现，简单但不持久                               |
| Server 端长期运行 | `FileMappingStore` 或 `RedisMappingStore`：落盘或集中式缓存，支持多实例共享       |

> **默认**：如果未传 `mappingStore`，内部将根据运行环境自动选择 Memory（Node）或 IndexedDB（浏览器）。

**流程**：

1. 创建实例时，根据 `baseUrl` 提取 host，查询 `mappingStore.get(host)`。
2. 若有缓存的 `channelId`，验证该通道状态是否 `active`；如已关闭则删掉缓存。
3. 若无缓存或验证失败，则调用 `payerClient.openChannelWithSubChannel()` 创建新通道，并 `mappingStore.set(host, channelId)`。

## 5. 代码示例

```typescript
import { PaymentChannelHttpClient } from '@nuwa-kit/payment-kit';

const httpPayer = new PaymentChannelHttpClient({
  baseUrl: 'https://api.llm-gateway.com',
  payerClientConfig: {
    chainConfig: { chain: 'rooch', rpcUrl: 'http://localhost:6767', network: 'local' },
    signer: myKeyManager,
    keyId: `${myDid}#key1`,
  },
  payerDid: myDid,
  maxAmount: BigInt('50000000000'), // 0.5 USD
  debug: true,
});

const result = await httpPayer.get('/v1/echo?q=hello');
console.log(result);
```

## 6. 与现有组件的关系

| 角色           | 组件                              | 说明                                      |
| -------------- | --------------------------------- | ----------------------------------------- |
| Payer 业务代码 | **PaymentChannelHttpClient (新)** | 负责 HTTP 交互与支付头封装                |
| Payer 支付逻辑 | `PaymentChannelPayerClient`       | 链无关支付操作，如开/关通道、签 SubRAV 等 |
| Payee 服务端   | `ExpressPaymentKit`               | 已提供 Billing Middleware 与恢复路由      |

## 7. 未来扩展

1. **自动 Claim 触发**：当累积金额达到阈值时，自动调用服务端 `/payment/commit` 接口。
2. **多资产、多 Channel 支持**：内部维护 map，按 `assetId` 选择合适的 channel。
3. **浏览器与 Node 兼容**：通过注入自定义 `fetch` 实现兼容不同运行时。
4. **Typed SDK 生成**：利用 OpenAPI 生成带类型的业务 API，再由 HttpPayer 注入支付逻辑。

## 8. 待办清单

- [ ] 在 `src/integrations/http/` 目录实现 `PaymentChannelHttpClient` 类。
- [ ] 提供单元测试覆盖握手、续签、错误分支。
- [ ] 更新 e2e 测试以替换 `createTestClient` 的临时实现。

---

> 以上设计欢迎 Review。如有建议，请在 PR 中评论讨论。
