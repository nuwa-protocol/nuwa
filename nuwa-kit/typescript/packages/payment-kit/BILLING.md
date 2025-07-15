# Billing System Design for @nuwa-ai/payment-kit

> **Status**: Draft – subject to refinement during M3 implementation
> 
> **Scope**: Applicable to all services (LLM-Gateway, generic HTTP, MCP, …) that rely on `@nuwa-ai/payment-kit` for RAV settlement.

---

## 1. Goals & Principles

| 编号 | 目标 | 说明 |
|----|------|------|
| G1 | **Pluggable** | 计费逻辑通过策略模式热插拔，服务可自定义或组合多种策略 |
| G2 | **Config-Driven** | 计费规则由 YAML / JSON / DB 配置，运营人员可在线调整，无需重编译 |
| G3 | **Composable** | 支持 `Composite` 策略嵌套，实现阶梯价、折扣、包月等复杂计费 |
| G4 | **Auditable** | 每次费用计算输出 `ruleId` 与明细，便于审计、对账 |
| G5 | **Efficient** | 本地 BigInt 纯运算，单次评估延迟 \< 1 ms |

---

## 2. High-Level Architecture

```
+------------------------------+
| 业务服务 (llm-gateway / mcp) |
+-------------▲----------------+
              | CostCalculator
+-------------┴----------------+
|   Billing Engine (payment)   |
|   · 策略解析 & 执行          |
|   · 规则缓存                 |
+-------------▲----------------+
              | Strategy
+-------------┴----------------+
|  内置 & 自定义策略库          |
+------------------------------+
```

* **Service-Side CostCalculator** – 收集计费上下文 (tokenUsage / path / size…) 并调用 Billing Engine。
* **Billing Engine** – 依据配置构造策略树并评估成本；多次调用自动走缓存。
* **Strategy** – 基础原子策略 (`FixedPrice`, `PerToken`, `PerRequest`, …) + `Composite`。

---

## 3. Core Interfaces (TypeScript)

```ts
// billing/types.ts
export interface BillingContext {
  serviceId: string;              // e.g. "llm-gateway"
  operation: string;              // e.g. "chat:completion"
  meta: Record<string, any>;      // promptTokens, path, bytes, duration, …
}

export interface Strategy {
  evaluate(ctx: BillingContext): Promise<bigint>;
}

export interface CostCalculator {
  calcCost(ctx: BillingContext): Promise<bigint>;
}
```

> 所有策略返回 `bigint`，单位与 RAV `accumulatedAmount` 保持一致（最小计费单位）。

---

## 4. Built-in Strategies

| 名称 | 关键字段 | 说明 |
|------|---------|------|
| `FixedPrice`   | `amount`                | 固定费用 |
| `PerRequest`   | `price`                 | 每次请求计价 |
| `PerToken`     | `promptPrice`, `completionPrice` | LLM 计价 (token * 单价) |
| `PerByte`      | `price`                 | 传输字节计价 |
| `Tiered`       | `tiers[] { upTo, price }` | 阶梯价 |
| `TimeBased`    | `ratePerSec`            | 按持续时间计费 |
| `Composite`    | `items: Strategy[]`     | 策略组合 (求和) |

> 新增策略只需实现 `Strategy`，放入 `billing/strategies/` 即可被工厂扫描。

---

## 5. Configuration Format (YAML)

```yaml
version: 1
serviceId: llm-gateway
rules:
  - id: gpt4o
    when: { model: "gpt-4o-mini" }
    strategy:
      type: PerToken
      promptPrice: "5e12"      # wei / token
      completionPrice: "15e12"

  - id: default
    default: true
    strategy: { type: FixedPrice, amount: "0" }
```

* `when` 支持 `path`, `pathRegex`, `model`, `method`, `meta.*` 等条件。
* 按声明顺序匹配；第一个满足即采纳，若均未命中则使用带 `default: true` 的规则。

---

## 6. Billing Engine & StrategyFactory (简要)

```ts
export class BillingEngine {
  private cache = new Map<string, Strategy>();
  constructor(private loader: ConfigLoader) {}

  async calcCost(ctx: BillingContext): Promise<bigint> {
    let strategy = this.cache.get(ctx.serviceId);
    if (!strategy) {
      const ruleCfg = await this.loader.load(ctx.serviceId);
      strategy = StrategyFactory.build(ruleCfg);
      this.cache.set(ctx.serviceId, strategy);
    }
    return strategy.evaluate(ctx);
  }
}
```

`StrategyFactory` 根据 `strategy.type` 递归构造策略实例，支持 `Composite` 嵌套。

---

## 7. Integrating with Payment-Kit

1. **注入 Engine**
   ```ts
   import { BillingEngine, FileConfigLoader } from "../billing";
   const billing = new BillingEngine(new FileConfigLoader());
   const payee = new PayeeService({ /* … */, billing });
   ```
2. **服务端计费流程**
   ```ts
   const cost = await this.billing.calcCost({
     serviceId: "llm-gateway",
     operation: "chat:completion",
     meta: tokenUsage
   });
   response.amountDebited = cost;
   ```
3. **实时扣费 (可选)** – 将 `cost` 直接加到返回的 `SubRAV.accumulatedAmount`，实现前置扣费。

---

## 8. Security & Audit

* **Rule 签名**: 可选 SHA-256 + ECDSA；BillingEngine 在加载时校验。  
* **上限保护**: `maxPerRequest`, `maxDaily`, `maxMonthly` 等强制阈值。  
* **审计日志**: `ctx`, `cost`, `ruleId`, `timestamp` 写入专用表，默认保留 30 天。

---

## 9. Performance Notes

* **规则缓存**: 命中率 \>99%，文件加载只发生在首次或热更新。  
* **BigInt 运算**: 纯 CPU，单次策略树 O(depth) \< 10。  
* **多线程**: 对于极端高并发，可通过 Node Worker pool 隔离 BigInt 计算。

---

## 10. Testing Matrix

| 维度 | 场景 | 断言 |
|------|------|------|
| 单元 | 单一策略 evaluate | cost == 预期 |
| 单元 | Composite 嵌套 | cost == Σ(sub) |
| 单元 | 规则匹配顺序 | 第一条命中规则生效 |
| 集成 | LLM token 计费 | 与 OpenAI/SP tokenUsage 对齐 |
| 集成 | HTTP 上传计费 | 大文件 bytes * price == cost |
| Fuzz  | 随机 meta | 不抛异常、cost ≥ 0 |

---

## 11. Roadmap (M3 ➜ M3.1)

- [ ] `billing/` scaffold & tsconfig path alias
- [ ] `Strategy` 基础实现 (Fixed, PerRequest, PerToken, Composite)
- [ ] YAML `FileConfigLoader` + `BillingEngine`
- [ ] Unit tests ≥ 80 % coverage
- [ ] Integrate with **llm-gateway** (token stats collector)
- [ ] Docs & examples (`docs/billing.md`)

> _After M3.1 the engine will be extended with Tiered, TimeBased, Discount and Multi-Tenant support._

---

**Appendix A – Example Rule Table (Postgres)**
```sql
CREATE TABLE billing_rules (
  id           SERIAL PRIMARY KEY,
  tenant_id    TEXT    NOT NULL DEFAULT '*',
  service_id   TEXT    NOT NULL,
  rule_json    JSONB   NOT NULL,
  updated_at   TIMESTAMP DEFAULT NOW()
);
CREATE INDEX idx_billing_service ON billing_rules (service_id);
```

---

这一文档描述了计费子系统的完整设计与落地路线，可直接纳入 `@nuwa-ai/payment-kit` M3.1 开发计划。 

---

## 12. DataSize Strategy – 按请求/响应字节计费

某些文件上传、下载或通用 API 场景，需要依据 **请求体**和/或**响应体**大小计费。为此提供 `DataSizeStrategy`。

### 12.1 YAML 配置示例
```yaml
version: 1
serviceId: file-api
rules:
  - id: upload
    when: { path: "/upload", method: "POST" }
    strategy:
      type: DataSize
      requestPrice:  "5e11"   # 5 × 10⁻⁷ / byte
      responsePrice: "1e11"   # 1 × 10⁻⁷ / byte
  - default:
      strategy: { type: FixedPrice, amount: "0" }
```

### 12.2 Strategy 实现草图
```ts
// billing/strategies/dataSize.ts
import { BaseStrategy } from "../strategy";
import { BillingContext } from "../types";

interface DataSizeCfg {
  requestPrice: bigint | string;
  responsePrice?: bigint | string; // 若缺省则与 requestPrice 相同
}

export class DataSizeStrategy extends BaseStrategy {
  private reqPrice: bigint;
  private resPrice: bigint;

  constructor(cfg: DataSizeCfg) {
    super();
    this.reqPrice = this.toBigInt(cfg.requestPrice);
    this.resPrice = cfg.responsePrice ? this.toBigInt(cfg.responsePrice) : this.reqPrice;
  }

  async evaluate(ctx: BillingContext): Promise<bigint> {
    const req = BigInt(ctx.meta.requestBytes ?? 0);
    const res = BigInt(ctx.meta.responseBytes ?? 0);
    return req * this.reqPrice + res * this.resPrice;
  }
}
```
并在 `StrategyFactory` 中注册：
```ts
case "DataSize":
  return new DataSizeStrategy(rule.strategy as any);
```

---

## 13. HTTP 服务集成示例 (Express)

以下示例展示如何在文件上传接口中统计字节数并调用计费引擎：

```ts
import express from "express";
import { BillingEngine, FileConfigLoader } from "@nuwa-ai/payment-kit/billing";

const app = express();
const billing = new BillingEngine(new FileConfigLoader());

app.post("/upload", express.raw({ type: "application/octet-stream", limit: "50mb" }), async (req, res) => {
  // 1) 收集请求/响应大小
  const requestBytes  = Number(req.headers["content-length"] || req.body.length || 0);

  // 2) 业务处理 (存储 / 解析 …)
  const respBody = JSON.stringify({ ok: true });
  const responseBytes = Buffer.byteLength(respBody, "utf8");

  // 3) 计费
  const cost = await billing.calcCost({
    serviceId: "file-api",
    operation: "upload",
    meta: { requestBytes, responseBytes }
  });

  // 4) 构造 Payment-Kit HTTP Response 头
  const headerVal = HttpHeaderCodec.buildResponseHeader({
    signedSubRav: updatedRAV,
    amountDebited: cost,
    serviceTxRef: `upload-${Date.now()}`
  });

  res.set("Pay-Header", headerVal).type("application/json").send(respBody);
});
```

> 服务端框架若无法直接获取响应体大小，可通过 `on('finish')` 事件或中间件包裹输出流进行统计。

---

此补充完成了 **DataSizeStrategy** 的配置、实现与 HTTP 集成说明，为未来文件/流量型服务计费提供参考。 

---

## 14. USD 计价与多 Token 结算

> 当运营侧更习惯以 **美元** 作为统一标价货币，而服务端实际结算 Token 可能是 RAV、USDC、ETH 等多种资产时，可按如下方案演进。

### 14.1 原则

1. **配置层固定美元** – YAML 内所有 `price/amount` 字段统一写成 **picoUSD**（1 pUSD = 10⁻¹² USD）整数，既精细又避免浮点误差。
2. **计费层双阶段** –
   1) 策略树先返回 *美元成本* (pUSD)
   2) BillingEngine 调用 `RateProvider` 折算为目标 Token 的最小单位（wei、sat、rav 等）。
3. **可审计** – 每次评估输出 `usdCost`、`assetCost`、`priceUsed`、`priceTimestamp`，方便对账。

### 14.2 核心接口

```ts
// billing/rate-provider.ts
export interface RateProvider {
  /** 1 资产最小单位 ≙ 多少 pUSD */
  getPricePicoUSD(assetId: string): Promise<bigint>;
  getLastUpdated(assetId: string): number | undefined;
}

// billing/types.ts（新增字段）
export interface BillingContext {
  serviceId: string;
  operation: string;
  assetId: string;               // 结算资产，如 "0x3::gas_coin::RGas" | "erc20:USDC"
  meta: Record<string, any>;
}
```

BillingEngine 折算逻辑示例：

```ts
const usdCost = await strategy.evaluate(ctx);   // pUSD
const price   = await rateProvider.getPricePicoUSD(ctx.assetId);
const decimals = BigInt(10 ** ASSET_PRECISION[ctx.assetId]);
const assetCost = (usdCost * decimals + price - 1n) / price; // 向上取整
return { assetCost, usdCost, priceUsed: price };
```

### 14.3 YAML 示例

```yaml
version: 1
serviceId: llm-gateway
currency: USD
rules:
  - id: gpt4
    when:
      model: "gpt-4o-mini"
      assetId: "erc20:USDC"      # 仅当结算资产为 USDC 时匹配
    strategy:
      type: PerToken
      promptPrice:  "50000"      # 0.05 USD  -> 50 000 µUSD
      completionPrice: "150000"  # 0.15 USD

  - id: default
    default: true
    strategy: { type: FixedPrice, amount: "0" }
```

### 14.4 RateProvider 建议

| 维度 | 建议 |
|------|------|
| 数据源 | Coingecko API、Chainlink Feed、内部撮合价，多源聚合容灾 |
| 缓存 | 内存 Map + TTL，稳定币 5 min，波动资产 30 s |
| 精度 | 统一 pUSD，返回 bigint |
| 安全 | 记录 `priceTimestamp`、`provider`，链上预言机可带签名 |

### 14.5 审计字段

- `usdCost` (pUSD)
- `assetCost`
- `priceUsed` (pUSD / asset 最小单位)
- `priceTimestamp`
- `rateProvider`

### 14.6 误差与风控

* **四舍五入规则**：建议向上取整，避免少收。
* **溢价 Buffer**：对高波动资产可在汇率上乘 `1 ~ 2 %` Buffer；或配置 `maxSlippage`。
* **失败兜底**：汇率获取失败时可使用上一次价格并写告警，或拒绝请求。

---

> 本章节提供了一套以美元标价、按实时汇率结算多种资产的扩展设计；默认实现保持“单资产最小单位整数”模式，团队可按需引入 `RateProvider` 和折算逻辑。 