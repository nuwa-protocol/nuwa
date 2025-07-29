# Express BillableRouter 快速指南

## 背景

手写 YAML 账单配置容易与代码脱节。`BillableRouter` 让你在 **声明路由的同时** 完成计费规则配置，做到 *code-as-config*。

## 安装前提

```bash
npm install express @nuwa-ai/payment-kit
```

> `BillableRouter` 只是一个 **helper**，核心支付逻辑依然由 `HttpBillingMiddleware` + `UsdBillingEngine` 完成。

## 快速上手

```ts
import express from 'express';
import {
  BillableRouter,
  UsdBillingEngine,
  ContractRateProvider,
  HttpBillingMiddleware
} from '@nuwa-ai/payment-kit';

// 1. 创建可计费路由
const billRouter = new BillableRouter({
  serviceId: 'echo-service',
  defaultPricePicoUSD: '500000000' // 0.0005 USD
});

// 2. 同时声明路由 & 价格（单位：picoUSD）
billRouter.get('/v1/echo', '1000000000', (req, res) => {
  res.json({ echo: req.query.q ?? 'hello' });
});

billRouter.post('/v1/process', '10000000000', (req, res) => {
  res.json({ processed: req.body });
});

// 3. Assemble Express app
const app = express();
app.use(express.json());
app.use(billRouter.router); // Mount所有业务路由

// 4. 构建计费引擎 (USD → Token)
const rateProvider = new ContractRateProvider(contract, 30_000);
const billingEngine = new UsdBillingEngine(billRouter.getConfigLoader(), rateProvider, {
  '0x3::gas_coin::RGas': { decimals: 8 }
});

// 5. 支付中间件（验证+扣费）
const paymentMW = new HttpBillingMiddleware({
  payeeClient,
  billingEngine,
  serviceId: 'echo-service',
  defaultAssetId: '0x3::gas_coin::RGas',
  debug: true
});
app.use(paymentMW.createExpressMiddleware());

app.listen(3000, () => console.log('🚀 Server ready'));
```

### 运行效果

1. **开发者体验**：修改接口路径时，计费配置跟着代码一起动；
2. **BillingEngine**：通过 `getConfigLoader()` 拿到实时生成的 `BillingConfig`；
3. **文档生成**：`billRouter.getRules()` 可用来导出 OpenAPI / Markdown 表格。

## API

### `new BillableRouter(options)`
| 参数 | 类型 | 说明 |
|------|------|------|
| `serviceId` | `string` | 服务唯一标识，用于计费配置 |
| `defaultPricePicoUSD` | `bigint \| string` | （可选）默认价格，未匹配到具体规则时使用 |
| `version` | `number` | （可选）配置版本，默认 `1` |

### `billRouter.<verb>(path, price, handler, ruleId?)`
所有 HTTP 动词 (`get`,`post`,`put`,`patch`,`delete`) 均可用。

* `path`：Express 路径模式
* `price`：字符串或 bigint，单位 picoUSD
* `handler`：标准 Express 处理函数
* `ruleId`：覆盖默认生成的规则 ID（可选）

### `billRouter.getConfigLoader()`
返回一个实现 `ConfigLoader` 的对象，可直接传给 `UsdBillingEngine` 或其他计费引擎。

### `billRouter.getRules()`
返回当前已注册的 `BillingRule[]`，便于生成文档或测试。

## 进阶用法

### 自定义策略
`BillableRouter` 目前内置 **PerRequest** 策略。如果你需要更复杂的、按 token/字节计价的策略，可以：

1. 先照常注册路由并指定一个 placeholder 价格；
2. 启动后获取 `billRouter.getRules()`，逐条替换为自定义 `strategy` 对象；
3. 或者自行扩展 `BillableRouter.register()` 逻辑。

### 代码生成 YAML
出于兼容需要，你依旧可以：

```ts
import fs from 'fs/promises';
import yaml from 'js-yaml';

await fs.writeFile(
  './config/echo-service.yaml',
  yaml.dump({
    version: 1,
    serviceId: 'echo-service',
    rules: billRouter.getRules()
  }),
  'utf-8'
);
```

这样就能同时满足“**代码声明 → YAML 导出**”的双重需求。

---

如有问题，欢迎到仓库讨论区提出 💬。 