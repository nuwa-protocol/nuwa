# Payment Kit 计费子系统 V2 重构设计

> 状态：Proposal – 尚未实施，可在 M4 中落地实现
>
> 本文档对应 Issues: *refactor-billing-v2*

---

## 1. 背景

当前计费实现存在以下痛点：

1. Rule-matching 逻辑分别存在于 `BillableRouter.findRule()` 及 `RuleMatcherStrategy.matchesRule()`，导致 **双重匹配**，行为可能不一致。
2. 多处 `strategyCache`（`BillingEngine`、`UsdBillingEngine` 等）使得缓存粒度和失效时机难以把控。
3. 配置加载依赖 `FileConfigLoader`，不利于与不同服务器框架深度集成，也与路由注册脱节。
4. 模块层级偏深（`factory -> strategy -> engine`），新同学难以快速定位核心代码。

---

## 2. 设计目标

| 目标 | 说明 |
| ---- | ---- |
| **单一匹配** | 任何一次请求只执行一次 Rule-matching，并将匹配结果透传到所有后续环节 |
| **模块扁平化** | 核心 API <5 个文件，减少"找代码"成本 |
| **可插拔** | 支持自定义 Strategy、RateProvider，无需改动核心代码 |
| **多框架复用** | Rule-matching 及 BillingEngine 与 Web 框架完全解耦 |

---

## 3. 新目录结构

```text
billing/
 ├── core/                # 纯函数 & 无状态
 │   ├── types.ts         # BillingContext / BillingRule / Strategy 等
 │   ├── rule-matcher.ts  # 唯一的规则匹配实现
 │   ├── strategy-registry.ts # Strategy 构造 + 进程级缓存
 │   └── converter.ts     # USD → 资产 折算工具
 ├── engine/
 │   └── billingEngine.ts # 有状态引擎，负责调用 rule-matcher + strategy
 ├── strategies/          # 内置策略库
 │   ├── perRequest.ts
 │   └── perToken.ts
 └── rate/                # 汇率提供器
     └── contract.ts
```

- **core/**：完全无状态，可在浏览器 / worker / Node 任意环境运行。
- **engine/**：唯一持缓存状态的模块；可注入 RateProvider 以启用多资产结算。

---

## 4. 核心 API

### 4.1 BillingContext
```ts
interface BillingContext {
  serviceId: string;
  operation: string;
  assetId?: string;
  meta: Record<string, any>;
}
```

### 4.2 BillingRule（路由侧声明）
```ts
interface BillingRule {
  id: string;
  when?: Record<string, any>;   // path / method / model / …
  default?: boolean;
  strategy: StrategyConfig;     // 例: { type:'PerRequest', price:'1000' }
  authRequired?: boolean;
  adminOnly?: boolean;
  paymentRequired?: boolean;
}
```

### 4.3 Rule-Matcher (core/rule-matcher.ts)
```ts
function findRule(meta: Record<string, any>, rules: BillingRule[]): BillingRule | undefined;
```
> 纯函数；Express、Koa、MCP 等所有框架调用同一实现。

### 4.4 StrategyRegistry (core/strategy-registry.ts)
```ts
register('PerRequest', cfg => new PerRequestStrategy(cfg));
getStrategy(rule: BillingRule): Strategy;   // 带进程内缓存
```

### 4.5 BillingEngine (engine/billingEngine.ts)
```ts
class BillingEngine {
  constructor(getRules: () => BillingRule[], rateProvider?: RateProvider);
  calcCost(ctx: BillingContext): Promise<bigint>;          // 内部自行匹配（每次实时读取规则）
  calcCostByRule(ctx: BillingContext, rule: BillingRule): Promise<bigint>; // 已知 rule
}
```

---

## 5. Express 集成示例（含 PerToken 场景）

```ts
// integrations/express/paymentKit.ts
const br = new BillableRouter();
br.get('/v1/echo', { pricing: '0' }, echoHandler);
br.post('/v1/chat', { pricing: '1000000' }, chatHandler);

const engine = new BillingEngine(() => br.getRules());

app.use(async (req, res, next) => {
  const rule = findRule({ method: req.method, path: req.path }, br.getRules());
  if (!rule) return next();

  // 鉴权
  if (rule.authRequired) await doAuth(req);

  // 计费 (已知 rule → 单次匹配)
  const cost = await engine.calcCostByRule(buildCtx(req), rule);
  // …后续处理
  next();
});

app.use(br.asExpressRouter());
```

#### PerToken 后置计费模式

对于依赖 **执行结果** 的策略（如 `PerToken`，需要先调用 LLM 拿到 `usage.total_tokens`），可采用 *两阶段*：

1. **Pre-flight**（路由前）
   - 解析 `SignedSubRAV`、验证余额上限等；
   - 把 `paymentSession` 对象挂到 `res.locals`，里面包含 `rule`、`signedSubRav`、`meta` 等。
2. **Post-flight**（`res.on('finish')` 回调）
   - 业务处理完成后，从 `res.locals` 读取 token 用量，更新 `meta`；
   - 调用 `engine.calcCostByRule()` 计算最终费用；
   - 生成下一个 `SubRAV` 并写入 Header。

示例：
```ts
app.use(async (req, res, next) => {
  const rule = findRule({ method: req.method, path: req.path }, br.getRules());
  const session: any = { rule };
  res.locals.paymentSession = session;
  // Pre-flight 检查省略…
  res.on('finish', async () => {
     if (!session.usage) return;             // 没有 usage 不计费
     const ctx = buildCtx(req, session.usage);
     const cost = await engine.calcCostByRule(ctx, rule);
     // 生成提案 header
     const headerVal = codec.encodeResponse(subRav, cost, txRef);
     res.setHeader(codec.getHeaderName(), headerVal);
  });
  next();
});

// 在业务处理里填充 usage
app.post('/chat', async (req, res) => {
  const usage = await callLLM(req.body);
  res.locals.paymentSession.usage = usage;
  res.json({ usage, result });
});
```

---

## 6. RateProvider 折算逻辑（可选）
若 `BillingContext.assetId` 存在且 BillingEngine 注入了 `RateProvider`，则自动进行 USD → 资产单位的折算。

```ts
const usdCost = await strategy.evaluate(ctx);
const price = await rateProvider.getPricePicoUSD(ctx.assetId);
const assetCost = (usdCost + price - 1n) / price; // 向上取整
```

---

## 7. 迁移步骤

1. **创建新 core/** 模块文件（`rule-matcher.ts`, `strategy-registry.ts`, `types.ts`）。
2. **重写 BillingEngine**，弃用 `factory.ts`、`usd-engine.ts`、`engine.ts`。
3. **修改 ExpressPaymentKit / HttpBillingMiddleware**：
   - 注册路由后将 `br.getRules()` 传入 `BillingEngine`。
   - 请求时先 `findRule()`，再走 `engine.calcCostByRule()`。
4. **删除 FileConfigLoader**，路由层即配置层。
5. **测试**：
   - 单元：`rule-matcher`, `strategy-registry` 缓存逻辑。
   - 集成：Express 环境整条链路。
6. **文档**：当前文件 + `express-integration.md` 示例。

---

## 8. FAQ

**Q: 需要动态热更新规则怎么办？**
> BillingEngine 构造时注入的是 `() => rules[]` **函数**。BillableRouter 在运行期 push/replace 规则后，Engine 每次调用 `getRules()` 都能拿到最新数组，无需手动清 Cache。只有在 *Strategy 代码* 本身热替换时，才需要清理 `strategy-registry` 的内部缓存。

**Q: 其他框架如何集成？**
> 复用相同的 `rule-matcher` 与 `BillingEngine`，换掉框架细节即可。示例参考 `docs/express-integration.md`。

**Q: 如何新增策略？**
> 实现 `Strategy` 接口→在 `strategy-registry.ts` `register()` 即可。

---

> 版权所有 © Nuwa Network 2024
