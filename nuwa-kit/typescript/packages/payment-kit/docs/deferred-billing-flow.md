# PaymentKit 计费流程（统一 Pre-flight / Post-flight）

> 适用版本：v0.2.x+

本文档描述新的 **统一计费流程** 设计，将 Pre-flight（请求前计费）与 Post-flight（请求后计费）整合为一套核心逻辑，减少重复代码并避免响应头写入时序问题。

---

## 流程拆解

每一次受计费保护的请求，无论是 Pre-flight 还是 Post-flight，都可以归纳为四个步骤：

| 步骤                    | 说明                                                          | 是否同步 | 产物                                            |
| ----------------------- | ------------------------------------------------------------- | -------- | ----------------------------------------------- |
| **A. 校验 (verify)**    | 校验客户端提交的 `SignedSubRAV`（如果有）                     | ✓ 同步   | `session.signedSubRAVVerified`                  |
| **B. 计费 (charge)**    | 根据 `BillingRule` + `usage` 计算此次请求成本                 | ✓ 同步   | `session.cost`                                  |
| **C. 出账 (issue)**     | 生成新的 `unsignedSubRAV` 与 `X-Payment-Channel-Data` Header  | ✓ 同步   | `session.unsignedSubRAV`, `session.headerValue` |
| **D. 持久化 (persist)** | 将新的 `unsignedSubRAV` 写入 `PendingSubRAVStore`，供下次校验 | ✗ 异步   | —                                               |

> 链上 Claim 操作由 `ClaimScheduler` 定时或阈值触发，此流程不直接触发 claim。

### 时序差异

- **Pre-flight (PerRequest/FixedPrice)** ：四步全部在业务逻辑执行 _之前_ 完成。
- **Post-flight (PerToken/UsageBased)** ：
  1. **A** 在业务逻辑之前完成
  2. 业务逻辑运行，写入 `res.locals.usage`
  3. **B & C** 在 `on-headers` 钩子内执行，立即写 Header
  4. **D** 在 `finish` 钩子或后台任务中异步持久化

---

## BillingContext 输入 / State 输出模型

在现有 `BillingContext` 基础上扩展：

```ts
interface BillingContext {
  /** 输入（只读） */
  meta: {
    method: string;
    path: string;
    billingRule?: BillingRule;
    signedSubRav?: SignedSubRAV;
    maxAmount?: bigint;
    clientTxRef?: string; // 由客户端或 SDK 生成的事务引用（输入）
    // ...其他与请求相关的静态元信息
  };

  /** 运行期状态（可写，可选） */
  state?: {
    // Step A
    signedSubRavVerified?: boolean;

    // Step B
    cost?: bigint;

    // Step C
    unsignedSubRav?: SubRAV;
    headerValue?: string;
    serviceTxRef?: string;
    nonce?: bigint;

    // Step D
    persisted?: boolean;

    // Post-flight usage 数据
    usage?: Record<string, any>;
  };
}
```

`context.state` 在 Middleware 各阶段通过 `req`/`res.locals` 传递，避免重复计算。

---

## PaymentProcessor 新接口

```ts
class PaymentProcessor {
  preProcess(req): BillingContext; // 执行步骤 A，返回 context
  settle(ctx: BillingContext, usage?): BillingContext; // 执行步骤 B & C（写入 ctx.state 并返回）
  persist(ctx: BillingContext): Promise<void>; // 执行步骤 D（可后台调用）
}
```

### 责任分工（细化）

| 方法                  | 责任                                                                                                                                                                                                                                                                                     | 是否异步                          |
| --------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------- |
| `preProcess(req)`     | 1. 解析 `X-Payment-Channel-Data` Header<br/>2. **验证** `SignedSubRAV`（查库 + 签名检验）<br/>3. 匹配 `BillingRule`，判断是否 `deferred`<br/>4. 对 _Pre-flight_ 规则：直接计算 **cost** 并生成 `unsignedSubRAV`、`headerValue`（需要的全部数据已齐备）<br/>5. 把以上产物写入 `ctx.state` | **async**（可能访问存储、链验签） |
| `settle(ctx, usage?)` | 只做“最后一公里”轻量工作：<br/>• 对 _Post-flight_ 规则：根据 `usage` 计算 **cost**，生成 `unsignedSubRAV` 与 `headerValue`<br/>• 对 _Pre-flight_ 规则：几乎什么都不做（产物已在 `preProcess` 生成）                                                                                      | **sync** 可实现（纯内存计算）     |
| `persist(ctx)`        | 将 `ctx.state.unsignedSubRAV` 写入 `PendingSubRAVStore`（供下次校验）以及后续链上 Claim Scheduler 使用                                                                                                                                                                                   | **async**                         |

> 设计原则：**一切 I/O 都放在 `preProcess/persist`**；`settle` 只做 CPU 级计算，确保能在 `on-headers` 同步调用。

---

## Express 集成示例

```ts
// 伪代码
app.use(async (req, res, next) => {
  const ctx = processor.preProcess(req);

  if (ctx.meta.billingRule?.strategy.deferred) {
    // Post-flight：业务后处理
    res.locals.ctx = ctx;
    next();

    // usage 写入由业务代码完成

    onHeaders(res, () => {
      const c = processor.settle(res.locals.ctx, res.locals.usage);
      res.setHeader('X-Payment-Channel-Data', c.state!.headerValue);
    });

    res.on('finish', () => processor.persist(res.locals.ctx));
  } else {
    // Pre-flight：立即结算 & 返回 Header
    const c = processor.settle(ctx);
    res.setHeader('X-Payment-Channel-Data', c.state!.headerValue);
    processor.persist(c).catch(console.error);
    next();
  }
});
```

---

## 兼容性

- **无需改动客户端协议**：Header 含义不变
- **旧代码迁移**：
  1. 将 `HttpBillingMiddleware` 内部逻辑迁移至新 `PaymentProcessor` 分层实现
  2. Router 侧仅负责挂钩 `on-headers` & `finish`，业务写 `res.locals.usage`

---

## FAQ

**Q: 计费策略如果不是 `PerToken` 怎么办？**  
`settle()` 根据 `BillingRule.strategy` 自适应：`PerRequest` 直接使用固定价格计算。

**Q: 如果持久化失败影响本次请求吗？**  
不会。Header 已经发送，持久化失败只影响后续校验，可通过重试/补偿解决。

**Q: 为什么不在 `settle()` 中直接写数据库？**  
保持 HTTP 响应快速返回，避免 Header 写入被阻塞。持久化可以异步完成。

---

## 结论

通过将计费流程拆分为 _校验 → 计费 → 出账 → 持久化_ 四步，并通过 `BillingContext.state` 统一传递运行期数据，Pre-flight 与 Post-flight 能够共用 90% 以上的代码，极大简化逻辑并彻底解决 Header 时序冲突问题。
