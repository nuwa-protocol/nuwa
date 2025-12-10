# MCP Server Proxy v2 方案（仅内嵌 MCP 服务，启用 Payment）

## 0. 摘要

- 本方案将服务简化为“内嵌 MCP 服务 + 逐次计费（per‑call）”。
- 仅保留 JSON‑RPC 运行在 streamable HTTP 的 `/mcp` 端点；彻底移除 REST 兼容层。
- 移除会话级 Header 认证；身份与支付均在每次工具调用参数中体现，由 `McpPaymentKit` 处理。
- 通过 `FastMcpStarter` 启动服务进程，自动集成 `McpPaymentKit` 与内置工具（如 `nuwa.discovery` 等），按需注册自定义付费/免费工具。

## 1. 目标与约束

- 单服务单端点：一个服务只暴露一个 `/mcp`，不做多 upstream/多 host 聚合。
- 无 REST：删除 `/mcp/tool.call` 等 REST 风格路径，只支持 `/mcp`（JSON‑RPC）。
- 无会话 Header 认证：删除连接期 `Authorization`（DIDAuthV1）入口校验；改为 per‑call 授权。
- 身份/计费边界清晰：由 `McpPaymentKit` 在 `invoke()` 时完成预处理→业务→结算→持久化。

## 2. 架构说明

- 运行时核心：`FastMcpStarter` + `McpPaymentKit`
  - `FastMcpStarter` 负责启动 streamable HTTP `/mcp` 服务（基于 `mcp-proxy` 的 `startHTTPServer`），并把注册的工具暴露给客户端。
  - `McpPaymentKit` 作为计费中枢，提供内置工具（如 `nuwa.discovery`）与结算闭环，工具调用通过 `kit.invoke` 完成计费包装。
- 工具模型：
  - 内置工具：随 `McpPaymentKit.registerBuiltIns()` 暴露，价格可为 0（免费）。
  - 自定义工具：通过 `registrar.paidTool/freeTool` 注册，价格由 `pricePicoUSD` 指定。
  - 工具名保持与业务一致，不做重写。

## 3. 接口与协议

- 仅保留：`POST /mcp`（streamable HTTP，JSON‑RPC）。
- 典型方法：`initialize`、`tools/list`、`tools/call`、`prompts/*`、`resources/*`。
- 移除：所有 REST 兼容路径（如 `/mcp/tool.call`）。
- 认证：不使用会话级 Header；每次工具调用的参数中携带 per‑call 鉴权/支付负载（如 `__nuwa_*`），由 Payment 中间件消费。

## 4. 配置（最小化，Payment 始终启用）

```yaml
# server 监听
port: 8080
endpoint: '/mcp'

# Payment & 链配置（McpPaymentKitOptions）
serviceId: 'my-service' # 本服务的 ServiceDID 所属身份标识
network: 'test' # local | dev | test | main
rpcUrl: '${ROOCH_RPC_URL}'
defaultAssetId: '0x3::gas_coin::RGas'
defaultPricePicoUSD: '1000000000000' # 0.001 USD
adminDid: ['did:rooch:0x...']
debug: false

# 自定义工具（按需）
register:
  tools:
    - name: 'calc.add'
      description: 'Add two integers'
      pricePicoUSD: '1000000000'
      parameters:
        a: { type: 'number' }
        b: { type: 'number' }
    - name: 'echo.free'
      description: 'Free echo'
      pricePicoUSD: '0'
      parameters:
        text: { type: 'string' }
```

> 说明：上述键与 `FastMcpStarter.createFastMcpServer(opts: FastMcpServerOptions)` 参数一致（`FastMcpServerOptions` 继承 `McpPaymentKitOptions` 并加入 `port`/`endpoint`/`register`）。

## 5. 计费与调用流程（per‑call）

1. 客户端 `tools/call`：在参数中携带签名与支付负载（如 `__nuwa_auth`、`__nuwa_payment`）。
2. `McpPaymentKit.invoke()`：
   - 预处理：验证授权/余额，必要时返回支付资源（`content` 中的 MCP resource）。
   - 业务执行：调用工具的 handler，返回业务 `content`。
   - 结算/持久化：生成并附加支付信息（若产生费用）。
3. 响应：客户端收到 `content`，其中既有业务数据，也可能包含支付资源；由客户端完成支付协商/重试。

## 6. 迁移步骤

1. 删除多 upstream/host 路由与 REST 入口；对外仅暴露 `/mcp`。
2. 移除入口 Header 认证；客户端改为 per‑call 授权（参数中 `__nuwa_*`），由服务端 Payment 消费。
3. 用 `FastMcpStarter` 启动服务：
   - 启动时注入链路配置（`serviceId`/`rpcUrl`/`network` 等）。
   - `registerBuiltIns()` 暴露内置工具；按需注册自定义工具。
4. 客户端更新：统一使用 JSON‑RPC `/mcp`；按需支持支付协商重试。

## 7. 安全与隔离

- 一服务一 ServiceDID 与独立存储，避免通道/nonce 竞争与串扰。
- 工具级授权与定价清晰，业务与计费解耦。
- 不通过代理聚合多个上游，减少跨域/跨租户复杂度。

## 8. 回退策略

- 若需要短期停用计费：可在注册工具时将价格设为 `0`（免费），业务路径不变。
- 或用前置反代仅做转发/限流，客户端直连内嵌服务不变。

---

> 本文档取代旧版中关于“多 upstream/REST/会话 Header 认证”的内容，v2 仅保留内嵌 MCP 服务 + Payment 的精简形态。
