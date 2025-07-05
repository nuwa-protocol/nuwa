# MCP Server Proxy 日志设计方案

> **目标**：在一次日志检索中就能完整了解 _一次请求_ 从入口 ➜ 鉴权 ➜ 路由 ➜ Upstream 调用 ➜ 响应 的全过程、各阶段耗时和错误位置。

---

## 1. 关键理念

1. **单链路唯一标识 `reqId`**  
   * 复用 Fastify 自带的 `request.id`，或接入 `@fastify/request-id` 自定义生成策略。  
   * 日志的所有条目都必须带上 `reqId`，方便串联。
2. **生命周期埋点**  
   * 在 Fastify 钩子（`onRequest / preHandler / onResponse / onError`）及 `forward*` 函数内记录阶段开始与结束时间。  
   * 将时间戳存入 `request.ctx.timings`，在 `onResponse` 统一计算并输出 Summary。
3. **结构化 JSON 日志**  
   * 一次请求最终生成 _一条_ `SUMMARY` 日志，字段固定、易机器解析。  
   * 错误阶段另外输出 `ERROR` 日志，同样携带 `reqId`。
4. **可观测字段**  
   | 字段 | 说明 |
   |------|------|
   | reqId | 请求 ID |
   | did | 经过 DIDAuth 验证后的调用方 DID |
   | method / url / status | HTTP 基础信息 |
   | upstream | 实际路由到的上游标识 |
   | timings.auth | DIDAuth 认证耗时 (ms) |
   | timings.route | 路由决策耗时 (ms) |
   | timings.upstream | Upstream 调用耗时 (ms) |
   | timings.total | 总耗时 (ms) |

---

## 2. RequestContext 扩展

```ts
export interface RequestContext {
  callerDid?: string;        // DIDAuth 得到的 DID
  upstream: string;          // 目标上游名称
  startTime: number;         // 请求开始时间 (ms)
  timings: Record<string, number>; // 各阶段耗时
}
```

---

## 3. Fastify 钩子实现

```ts
// onRequest – 初始化 ctx
server.addHook('onRequest', (req, _reply, done) => {
  req.ctx = {
    startTime: Date.now(),
    upstream: config.defaultUpstream,
    timings: {},
  };
  done();
});

// didAuthMiddleware – 鉴权并记录耗时
const t0 = Date.now();
// ...verify logic...
req.ctx.timings.auth = Date.now() - t0;

// preHandler – 路由并记录耗时
const t1 = Date.now();
// ...determineUpstream...
req.ctx.timings.route = Date.now() - t1;

// forward* – 调用上游并记录耗时
const t2 = Date.now();
// ...await up.client.xxx...
req.ctx.timings.upstream = Date.now() - t2;

// onResponse – 汇总并输出 Summary
server.addHook('onResponse', (req, reply, done) => {
  const total = Date.now() - req.ctx.startTime;
  const summary = {
    reqId: req.id,
    did: req.ctx.callerDid ?? null,
    method: req.method,
    url: req.url,
    status: reply.statusCode,
    upstream: req.ctx.upstream,
    timings: { ...req.ctx.timings, total },
  };
  req.log.info(summary, 'request.summary');
  done();
});

// onError – 发生异常时记录错误
server.addHook('onError', (req, _reply, err, done) => {
  req.log.error(
    {
      reqId: req.id,
      did: req.ctx.callerDid ?? null,
      stage: 'error',
      upstream: req.ctx.upstream,
      err,
    },
    'request.error',
  );
  done();
});
```

---

## 4. 示例日志

```jsonc
// 正常请求 SUMMARY
{"level":"info","msg":"request.summary","reqId":"abc123","did":"did:rooch:0xdead...","method":"POST","url":"/mcp/tool.call","status":200,"upstream":"context7","timings":{"auth":3,"route":1,"upstream":152,"total":158}}

// 发生错误
{"level":"error","msg":"request.error","reqId":"abc123","did":"did:rooch:0xdead...","stage":"upstream","upstream":"context7","err":{"message":"ECONNRESET"}}
```

---

## 5. 进阶实践

1. **OpenTelemetry 分布式链路追踪**  
   集成 `@opentelemetry/sdk-node` 与 `@opentelemetry/instrumentation-fastify`，将 `reqId` 升级为 W3C Trace Context，跨服务追踪。
2. **Prometheus Metrics**  
   将 `timings.*` 写入 Histogram，监控 p95/p99 延迟。
3. **日志采样 / 报警**  
   • 对 `total` > 1000 ms 的请求标 `warn` 级别。  
   • 将 `status >= 500` 的请求输出 `error` 并报警。

---

> 完成以上改动后，排障时只需根据 `reqId` 检索，就能迅速定位耗时阶段和错误原因。 