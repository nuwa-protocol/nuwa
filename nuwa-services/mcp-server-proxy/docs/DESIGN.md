# MCP Server Proxy – Design Document

## 1. Motivation
Nuwa 生态中的部分 MCP 服务（**Model Capability Providers**）尚未完成基于 **NIP-10 DIDAuthV1** 的身份认证改造，导致无法直接被其它 Nuwa 应用（客户端、Agent、服务等）安全地调用。

为解决过渡期的兼容性问题，设计 **MCP Server Proxy**，在代理层完成身份验证、计费与协议转换，使得：

1. Nuwa 客户端始终以 **DIDAuthV1** 进行调用，不感知后端真实 MCP 的认证方式；  
2. 现有仅支持 `api-key`、`basic-auth` 或 **无认证** 的 MCP 依旧可被安全使用；  
3. 仅支持 **stdio** 工作模式的 MCP 可被转换为 **httpStream/SSE** 模式暴露；  
4. 未来可在代理层统一加入 **usage metering & billing** 逻辑。

## 2. 功能目标

| # | 功能 | 说明 |
|---|------|------|
| 1 | DIDAuth 身份认证 | 代理入口校验 `Authorization: DIDAuthV1 …`，拒绝未通过验证的请求。 |
| 2 | Upstream 认证转换 | 根据配置把请求注入 `api-key` / `basic-auth` / Bearer Token 等字段后再转发到目标 MCP。 |
| 3 | stdio → httpStream 转换 | 挂载 **stdio 模式 MCP** 的 stdin/stdout，并将其流式输出通过 **Server-Sent Events (SSE)** 暴露为 httpStream。 |
| 4 | 计费钩子 | 所有请求与响应都会经过 `preHandle` / `postHandle` 钩子，可在此统计 token 用量并写入账单。 |
| 5 | 多租户支持 | 不同调用方可路由到独立的 **upstream**，并使用各自计费策略。 |

## 3. 协议兼容性 (JSON-RPC vs REST-like)

为了兼容不同年代、不同语言实现的 MCP Client/Server，代理同时支持 **两种** 主流的调用风格：

| 风格 | 示例请求 | 何时使用 |
|---|---|---|
| **REST-like** | `POST /mcp/tool.call`<br>`{ "name": "echo", "arguments": { ... } }` | Nuwa & Vercel 生态的 TypeScript 实现，如 `@mcp/client`、`context7` 等 |
| **JSON-RPC** | `POST /mcp` with body `{ "jsonrpc":"2.0", "method":"tools/call", ... }` | LiteLLM、`python-mcp` 等 Python 实现，以及其它历史客户端 |

**兼容规则:**
1. `GET /mcp` 请求总是返回 **200 OK** 并建立一个 SSE 长连接（会定时发送 keep-alive 注释），供 JSON-RPC 客户端先行探测和保持连接。
2. `POST /mcp` 请求会根据其 body 中的 `method` 字段（如 `tools/call`）在内部转发到对应的 REST-like 路径（如 `/mcp/tool.call`）进行处理。
3. 未知的 `method` 会返回标准的 JSON-RPC `-32601` (Method not found) 错误。

## 4. 高层架构
```mermaid
graph TD
  A[Client / Agent] -- DIDAuthV1 --> P(MCP Server Proxy)
  P -- httpStream / SSE --> U1[Upstream MCP (httpStream)]
  P -- stdio wrapper --> U2[Upstream MCP (stdio)]
  subgraph Proxy Components
    P
    subgraph Auth & Billing
      Auth[DIDAuth Validator]
      Bill[Usage Meter]
    end
    Router[Request Router]
    Adapter[Protocol Adapter]
  end
  P --> Auth
  P --> Bill
  P --> Router
  Router --> Adapter
```

### 4.1 组件说明
1. **Auth (DIDAuth Validator)**: 使用 `@nuwa-ai/identity-kit` 验证 `Authorization` 头，产出 `callerDid`。  
2. **Router**: 根据主机名决定转发到哪个 **Upstream**。  
3. **Adapter**: 负责：
   - 注入 **Upstream** 所需的认证信息（api-key/basic-auth/...）；
   - 根据 **Upstream** 协议差异（stdStream / httpStream）进行转换；
   - 将响应封装为 **SSE** 并转发给客户端。
4. **Billing**: 在请求完成后，根据 `usage` Header 或解析结果（例如 OpenAI 风格 `x-usage-tokens`）累加用量。

## 5. 流程时序
```mermaid
sequenceDiagram
  participant C as Client
  participant PX as Proxy
  participant U as Upstream MCP
  C->>+PX: POST /mcp(tool.call)\nAuthorization: DIDAuthV1 …
  PX-->>C: 401/403 (if invalid)
  PX->>Auth: verify(signature)
  Auth-->>PX: ok & callerDid
  PX->>Bill: startMeter(callerDid)
  PX->>U: transformed request (api-key/...)
  U-->>PX: SSE/stream response
  PX->>Bill: endMeter(usage)
  PX-->>C: SSE/stream response (unchanged)
```

## 6. 配置文件 (`config.yaml`)

### 6.1 配置示例
```yaml
# nuwa-services/mcp-server-proxy/config.yaml

# HTTP 服务监听地址
server:
  host: "0.0.0.0"
  port: 8088
  cors:
    origin: "*"
    methods: ["GET", "POST", "OPTIONS"]
  logger:
    level: "info"
    prettyPrint: true

# 默认 upstream，当没有路由命中时使用
defaultUpstream: openrouter

# 上游 MCP 服务列表
upstreams:
  openrouter:
    type: httpStream
    url: https://openrouter.ai/mcp
    auth:
      scheme: header
      header: Authorization
      value: "Bearer ${OPENROUTER_API_KEY}"

  internal-llm:
    type: stdio
    command: ["./my-llm-binary", "--mcp-stdio"]
    cwd: /opt/llm

  legacy-mcp:
    type: httpStream
    url: https://legacy.example.com/mcp
    auth:
      scheme: basic
      username: alice
      password: secret

# 基于主机名（前缀）路由到对应 upstream
routes:
  - hostname: "openrouter."
    upstream: openrouter
  - hostname: "amap."
    upstream: legacy-mcp
```

### 6.2 路由规则说明
当前版本支持 **主机名精确匹配或前缀匹配** 的路由规则。`hostname` 字段可以写完整域名（`context7.mcpproxy.xyz`）或以点号结尾的前缀（`context7.`），后者会匹配任意以该前缀开头的主机名。

### 6.3 配置文件路径
配置文件默认位于项目根目录下的 `config.yaml`。可以通过环境变量 `CONFIG_PATH` 指定自定义路径：
```bash
CONFIG_PATH=/path/to/your/config.yaml pnpm start
```

### 6.4 环境变量替换
配置文件中可以使用 `${ENV_VAR_NAME}` 语法引用环境变量，服务启动时会自动替换：
```yaml
# ...
    auth:
      scheme: "header"
      header: "Authorization"
      value: "Bearer ${OPENROUTER_API_KEY}"
```
启动时需设置该环境变量：
```bash
export OPENROUTER_API_KEY=your_secret_key
pnpm start
```

## 7. 关键实现要点
1. **实现方式**：使用 **Fastify** + `undici`(fetch)；stdStream 适配器用 `child_process.spawn` 挂载。  
2. **DIDAuth 库**：直接引用 `@nuwa-ai/identity-kit` 的 `DIDAuth.v1.verifyAuthHeader`。  
3. **SSE 框架**：`fastify-sse-v2` 或自行实现 `text/event-stream` 头部。  
4. **限流 / 重试**：可集成 `@fastify/rate-limit` 与重试中间件，确保上游稳定性。

## 8. 迭代计划
- **v0.1 (MVP)**: 支持 httpStream 转发 + DIDAuth 校验 + 固定 api-key 注入。  
- **v0.2**: 支持 stdio 适配与 SSE 转换；基础计费（记录 token counts）。  
- **v0.3**: 可插拔 Billing Provider；多租户配置热加载；Prometheus 指标。  
- **v1.0**: 生产就绪，支持高可用部署、动态路由、细粒度计费策略。

## 9. 技术选型与核心依赖
| 维度 | 选型 | 原因 |
|---|---|---|
| 运行时 | **Node.js ≥ 20** | 原生 `fetch/stream` 支持、LTS 长期维护，Nuwa JS 生态统一 |
| 语言 | **TypeScript 5.x** | 类型安全、与 `fastmcp` / `identity-kit` 等 Nuwa 包零摩擦 |
| Web 框架 | **Fastify** | 高性能、插件生态（SSE、rate-limit）、链式生命周期钩子方便集成 Auth/计费 |
| MCP 协议库 | `@modelcontextprotocol/sdk` | 官方 SDK，负责解析/构造 MCP 报文，可直接调用上游 MCP |
| DIDAuth | `@nuwa-ai/identity-kit` | Nuwa 官方库，支持 NIP-10 DIDAuthV1 验证 |
| HTTP 客户端 | **undici** | `fetch` API 的 Node.js 实现，性能优异 |
| SSE 插件 | `fastify-sse-v2` | 快速构建 `text/event-stream` 响应 |
| 进程管理 | **pm2** / **docker** / **k8s** | 支持热重载、日志收集、水平扩容 |
| 构建工具 | **esbuild** / **bun build** | 极快 TS 转译；开发阶段用 `tsx --watch` 热更新 |
| 测试 | **vitest** + **supertest** | 同步 TypeScript 配置，Mock HTTP 方便做路由/计费单测 |

### 9.1 项目目录结构
```
nuwa-services/mcp-server-proxy/
├── src/
│   ├── server.ts        # Fastify 启动文件
│   ├── auth.ts          # DIDAuth 中间件
│   ├── router.ts        # Hostname 路由 -> upstream 映射
│   ├── upstream.ts      # Upstream 初始化与请求转发
│   └── types.ts         # 配置 & 上下文类型定义
├── config.yaml          # 示例配置
├── package.json         # 依赖与脚本
└── tsconfig.json
```

### 9.2 开发脚本
```json
"scripts": {
  "dev": "tsx watch src/server.ts",
  "build": "esbuild src/server.ts --bundle --platform=node --target=node20 --sourcemap --outfile=dist/index.js",
  "start": "node dist/index.js",
  "test": "vitest"
}
```

## 10. 项目安装与使用

### 10.1 安装依赖
```bash
cd nuwa-services/mcp-server-proxy
pnpm install
```

### 10.2 配置
参考 `## 6. 配置文件` 章节，创建并编辑你自己的 `config.yaml` 或 `config.local.yaml`。

### 10.3 开发模式运行
```bash
pnpm dev
```

### 10.4 构建与生产环境运行
```bash
# 1. 构建项目
pnpm build

# 2. 运行生产代码
pnpm start
```

### 10.5 测试
```bash
pnpm test
```

### 10.6 Docker 部署
```bash
# 1. 构建 Docker 镜像
docker build -t mcp-server-proxy .

# 2. 运行 Docker 容器
docker run -p 8088:8088 -v $(pwd)/config.yaml:/app/config.yaml mcp-server-proxy
```

## 11. 故障排除

### 11.1 常见问题
1. **上游连接失败**: 检查 `config.yaml` 中 upstreams 的 `url` 是否正确、目标服务是否可用、`auth` 认证信息（如 API Key）是否有效。
2. **DIDAuth 验证失败**: 确保客户端发送了正确的 `Authorization: DIDAuthV1 ...` 头。
3. **stdio 进程崩溃**: 检查 `command` 路径和参数是否正确，以及目标程序是否有执行权限。

### 11.2 日志
日志级别可以在配置文件中调整，方便调试：
```yaml
server:
  logger:
    level: "debug"  # 可选值: trace, debug, info, warn, error, fatal
    prettyPrint: true
```
---
> 本文档描述了 MCP Server Proxy 的设计与使用。如有问题或建议，请提交 Issue 或 Pull Request。