# JSON Serialization Strategy & Zod Integration Proposal

## 1 Background

Payment-Kit 需要在 **Node.js / Browser / Blockchain** 三端安全地传输包含 `bigint` 的大整数数据（如 `accumulatedAmount`, `nonce`, `channelEpoch`）。

旧实现

| 阶段         | 做法                                        | 问题                                                 |
| ------------ | ------------------------------------------- | ---------------------------------------------------- |
| **序列化**   | `JSON.stringify()` + 手写 `BigInt` replacer | 重复代码、易遗漏、新字段报错                         |
| **反序列化** | `JSON.parse()` + 手写字段白名单             | 1. 需要维护白名单 2. 小整数 BigInt ↔ number 语义混淆 |

改进 v1 (已落地)

- 采用 **lossless-json** —— BigInt 统一序列化为字符串；解析阶段得到 `LosslessNumber`
- 仍需在 reviver 中维护 **白名单** 决定哪些字段转 BigInt

## 2 痛点复盘

1. **类型擦除**
   - TypeScript 在运行时无法得知 `T` 的字段类型 → 纯推断不可靠。
2. **白名单维护成本**
   - 新增字段必须同步到白名单；遗漏就会出现 "1n / 1" 类型错乱。
3. **调试易踩坑**
   - `JSON.stringify(obj)` 仍会抛 `TypeError: Do not know how to serialize a BigInt`。

## 3 业界方案对比

| 方案            | 核心思路                                  | 代表库                | 备注                   |
| --------------- | ----------------------------------------- | --------------------- | ---------------------- |
| **标签法**      | `{"$bigint":"123"}` / `"123L"`            | superjson             | 需要改协议/字段        |
| **装饰器反射**  | `class-transformer` + `@Type(()=>BigInt)` | NestJS                | 仅限 class 风格        |
| **Schema 驱动** | 运行时或编译期 Schema 生成 (de)serializer | **Zod**, io-ts, typia | 类型与校验同步，最灵活 |

## 4 为什么选择 Zod？

- **运行时可用**：Schema 与代码同在，无需额外生成步骤即可 `parse()` / `safeParse()`。
- **编译期安全**：`type R = z.infer<typeof RespSchema>` 保证类型与校验 1:1。
- **Transform 支持**：`z.string().transform(BigInt)` 简洁声明字段转换逻辑。
- **生态成熟**：tRPC、Next-Auth、React Form 等均内置集成。

## 5 落地方案

### 5.1 目录结构

```
src/
 └── schema/
     ├── api/
     │   ├── subrav.ts         # SubRAVSchema
     │   ├── recovery.ts       # RecoveryResponseSchema
     │   └── ...
     └── index.ts              # 聚合导出 & 类型 re-export
```

### 5.2 示例——`RecoveryResponse`

```ts
// src/schema/api/recovery.ts
import { z } from 'zod';

export const SubRavSchema = z.object({
  version: z.number(),
  chainId: z.bigint(),
  channelId: z.string(),
  channelEpoch: z.bigint(),
  vmIdFragment: z.string(),
  accumulatedAmount: z.bigint(),
  nonce: z.bigint(),
});

export const RecoveryResponseSchema = z.object({
  channel: SubRavSchema.nullable(),
  pendingSubRav: SubRavSchema.nullable(),
  timestamp: z.string(), // ISO-8601
});

export type RecoveryResponse = z.infer<typeof RecoveryResponseSchema>;
```

### 5.3 服务器端使用

```ts
import { sendJsonResponse } from '../utils/json';
import { RecoveryResponseSchema } from '../schema/api/recovery';

// handler 内
sendJsonResponse(res, RecoveryResponseSchema.parse(payload));
```

- **保障**：若返回值不符合 Schema 会在运行时抛错，避免脏数据外溢。

### 5.4 客户端使用

```ts
import { RecoveryResponseSchema } from '../schema/api/recovery';
import { parseJsonResponse } from '../utils/json';

const raw = await response.text();
const apiResp = RecoveryResponseSchema.parse(JSON.parse(raw));
```

- 对外暴露的类型 `RecoveryResponse` 始终与服务端一致；BigInt 字段自动转换。

### 5.5 与 `lossless-json` 协同

| 流程                             | 角色                              | 作用                         |
| -------------------------------- | --------------------------------- | ---------------------------- |
| `serializeJson()`                | 服务器出站<br>LocalStorage 持久化 | 避免 BigInt 报错；字符串包裹 |
| `JSON.parse()` + **Zod.parse()** | 客户端/服务器入站                 | 校验 + 字段级转换为 BigInt   |

> 这样既保留 `lossless-json` 的“0 精度损失”特性，又不需要手动白名单。

### 5.6 迁移步骤

1. **安装依赖**
   ```bash
   pnpm add zod
   ```
2. **为每个 API 定义 Schema**（可从 `src/types/api.ts` 复制声明）。
3. **替换**
   - Server：所有 `createSuccessResponse(...)` 调用 ➜ 先 `schema.parse()` 再返回。
   - Client：`parseJsonResponse()` 返回值 ➜ 传入对应 Schema 校验。
4. **删除** `parseJson` 白名单逻辑，只保留安全整数 → number 转换规则（可选）。

### 5.7 兼容策略

- **渐进迁移**：允许旧 handler 继续使用白名单 reviver，新代码逐步换成 Zod。
- **性能监控**：Zod 解析性能≈ 50-100 ns/字段，满足当前吞吐量。

### 5.8 Handler Registry with Zod （参数与返回值双向校验）

> 目标：在 `handlers/index.ts` 处就绑定 **Zod Schema + 业务 handler**，  
> 让 **编译期类型** 与 **运行时校验** 保持一致，Express 适配器无需额外改动。

#### 5.8.1 公共工具

```ts
// src/api/utils.ts
import type { z } from 'zod';

type ZodSchemaPair<Req, Res> = {
  request: z.ZodType<Req>;
  response: z.ZodType<Res>;
};

export interface ApiHandlerConfig<Req, Res> {
  method: 'GET' | 'POST' | 'PUT' | 'DELETE' | 'PATCH';
  schema: ZodSchemaPair<Req, Res>; // ★ Zod Schema
  handler: Handler<ApiContext, Req, Res>; // 业务函数
  options: RouteOptions; // 计费 / 鉴权等元数据
}

/**
 * 运行时包装器：入参 / 出参 双向校验
 */
export function createValidatedHandler<Req, Res>(
  cfg: ApiHandlerConfig<Req, Res>
): ApiHandlerConfig<Req, Res> {
  return {
    ...cfg,
    async handler(ctx, rawReq) {
      const req = cfg.schema.request.parse(rawReq); // 1️⃣ 参数校验
      const rawRes = await cfg.handler(ctx, req); // 2️⃣ 业务逻辑
      return cfg.schema.response.parse(rawRes); // 3️⃣ 返回值校验
    },
  };
}
```

#### 5.8.2 Registry 书写示例

```ts
// src/api/handlers/index.ts
import { createValidatedHandler } from '../utils';
import { RecoveryRequestSchema, RecoveryResponseSchema } from '../../schema/api/recovery';
import { handleRecovery } from './recovery';

export const BuiltInApiHandlers = {
  '/recovery': createValidatedHandler({
    method: 'GET',
    schema: {
      request: RecoveryRequestSchema,
      response: RecoveryResponseSchema,
    },
    handler: handleRecovery,
    options: { authRequired: true },
  }),

  // ... 其他接口按同样模式编写
} as const;
```

#### 5.8.3 迁移 Checklist

1. 为每个 Handler 创建 `request` / `response` Zod Schema（放在 `src/schema/api/`）。
2. 用 `createValidatedHandler()` 包装并注册到 `handlers/index.ts`。
3. 旧 Express 适配器 **无需改动**，因校验已在包装器内部完成。
4. 跑 `pnpm test:e2e:local`，确认所有 Schema 校验通过。

## 6 后续展望

- 若未来追求**零运行时开销**，可用 **typia** 生成与 Zod 等价的静态 (de)serializer。
- 对外文档统一从 Zod Schema 生成（OpenAPI / JSON-Schema），自动同步 API 文档。

---

**结论**：引入 Zod 能根治手写白名单带来的维护痛点，并确保 BigInt 字段语义正确、类型安全。该方案与现有 `lossless-json` 完全兼容，可按上述步骤平滑迁移。
