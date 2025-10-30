# 项目结构说明

## 📂 完整目录结构

```
nuwa-services/capstore-indexer/typescript/indexer/
│
├── src/                              # 源代码目录
│   ├── restful-api/                  # ⭐ RESTful API 模块（新增）
│   │   ├── index.ts                  # 主路由处理器（入口）
│   │   ├── utils.ts                  # 工具函数库
│   │   ├── query-caps.ts            # GET /api/caps 处理器
│   │   ├── query-cap-by-id.ts       # GET /api/caps/:id 处理器
│   │   ├── query-cap-by-cid.ts      # GET /api/caps/cid/:cid 处理器
│   │   └── README.md                # RESTful API 开发文档
│   │
│   ├── services/                     # MCP 服务模块
│   │   ├── service.ts               # 主服务配置（已更新导入）
│   │   ├── upload-cap.ts            # 上传 Cap 工具
│   │   ├── download-cap.ts          # 下载 Cap 工具
│   │   ├── favorite-cap.ts          # 收藏 Cap 工具
│   │   ├── rate-cap.ts              # 评分 Cap 工具
│   │   ├── update-enable-cap.ts     # 更新 Cap 状态工具
│   │   ├── query-cap-by-id.ts       # MCP: 查询 Cap (ID)
│   │   ├── query-cap-by-name.ts     # MCP: 查询 Cap (名称)
│   │   ├── query-cap-stas.ts        # MCP: 查询 Cap 统计
│   │   ├── query-my-favorite-cap.ts # MCP: 查询我的收藏
│   │   └── query-cap-rating-distribution.ts # MCP: 评分分布
│   │
│   ├── index.ts                      # 应用入口
│   ├── constant.ts                   # 常量定义
│   ├── event-handle.ts              # 事件处理
│   ├── supabase.ts                  # Supabase 数据库操作
│   └── type.ts                      # 类型定义
│
├── examples/                         # 测试示例
│   ├── test-api.sh                  # Bash 测试脚本
│   └── test-api.js                  # Node.js 测试脚本
│
├── dist/                            # 编译输出目录
│   └── src/
│       ├── restful-api/             # ⭐ RESTful API 编译输出
│       │   ├── index.js
│       │   ├── utils.js
│       │   ├── query-caps.js
│       │   ├── query-cap-by-id.js
│       │   └── query-cap-by-cid.js
│       └── services/
│           └── ...
│
├── tests/                           # 测试文件
│   ├── env.ts
│   └── supabase.test.ts
│
├── API.md                           # 📖 API 使用文档
├── QUICK_START.md                   # 📖 快速入门指南
├── CURL_EXAMPLES.md                 # 📖 Curl 测试示例
├── CHANGES.md                       # 📖 变更说明
├── REFACTORING.md                   # 📖 重构总结
├── PROJECT_STRUCTURE.md             # 📖 本文档
├── package.json                     # 项目配置
├── tsconfig.json                    # TypeScript 配置
└── vitest.config.ts                # Vitest 测试配置
```

## 🎯 核心模块说明

### 1. RESTful API 模块 (`src/restful-api/`)

**新增的模块化 API 实现**

```
restful-api/
├── index.ts          → 主路由分发器，处理所有 /api 请求
├── utils.ts          → 工具函数：JSON 解析、响应、CORS 等
├── query-caps.ts     → GET /api/caps（搜索、分页、排序）
├── query-cap-by-id.ts → GET /api/caps/:id（根据 ID 查询）
└── query-cap-by-cid.ts → GET /api/caps/cid/:cid（根据 CID 查询）
```

**数据流**:
```
HTTP Request
    ↓
FastMCP Server (payment-kit)
    ↓
customRouteHandler: handleApiRoutes (restful-api/index.ts)
    ↓
路由匹配
    ├── /api/caps → query-caps.ts
    ├── /api/caps/:id → query-cap-by-id.ts
    └── /api/caps/cid/:cid → query-cap-by-cid.ts
        ↓
    Supabase 查询 (supabase.ts)
        ↓
    JSON 响应 (utils.ts)
```

### 2. MCP 服务模块 (`src/services/`)

**MCP 协议实现，包含所有工具定义**

```
services/
├── service.ts        → 主服务配置，初始化 MCP 服务器
├── 免费工具（freeTool）:
│   ├── download-cap.ts
│   ├── query-cap-by-id.ts
│   ├── query-cap-by-name.ts
│   ├── query-cap-stas.ts
│   ├── query-my-favorite-cap.ts
│   └── query-cap-rating-distribution.ts
└── 付费工具（paidTool）:
    ├── upload-cap.ts
    ├── rate-cap.ts
    ├── favorite-cap.ts
    └── update-enable-cap.ts
```

**数据流**:
```
MCP Client Request
    ↓
FastMCP Server (payment-kit)
    ↓
MCP Protocol Handler
    ↓
Tool Execution
    ├── freeTool (无需支付)
    └── paidTool (需要支付)
        ↓
    Supabase 查询/更新
        ↓
    MCP 响应
```

### 3. 数据库模块 (`src/supabase.ts`)

**Supabase 数据库操作封装**

主要函数：
- `queryFromSupabase()` - 查询 Caps（支持各种过滤和排序）
- `queryCapStats()` - 查询 Cap 统计信息
- `queryUserFavoriteCaps()` - 查询用户收藏
- `getCapRatingDistribution()` - 获取评分分布
- 其他数据库操作...

## 🔄 请求处理流程

### RESTful API 请求

```
1. HTTP GET http://localhost:3000/api/caps?name=test
                    ↓
2. FastMCP Server (customRouteHandler)
                    ↓
3. restful-api/index.ts (handleApiRoutes)
                    ↓
4. 匹配路由: pathname === '/api/caps'
                    ↓
5. restful-api/query-caps.ts (handleQueryCaps)
                    ↓
6. 解析查询参数: parseQueryParams()
                    ↓
7. 调用数据库: queryFromSupabase(null, 'test', ...)
                    ↓
8. 返回响应: sendJson(res, 200, { code: 200, data: {...} })
```

### MCP 协议请求

```
1. MCP Client: tools/call { name: "queryCapByName", params: {...} }
                    ↓
2. FastMCP Server
                    ↓
3. McpPaymentKit (billing middleware)
                    ↓
4. services/query-cap-by-name.ts (execute)
                    ↓
5. 调用数据库: queryFromSupabase(...)
                    ↓
6. MCP 响应: { content: [{ type: "text", text: "..." }] }
```

## 📊 模块依赖关系

```
┌─────────────────────────────────────────────────┐
│          Application Entry (index.ts)           │
└───────────────┬─────────────────────────────────┘
                │
        ┌───────┴────────┐
        ↓                ↓
┌───────────────┐  ┌──────────────────┐
│  Event Handle │  │  Service Init    │
└───────────────┘  └────────┬─────────┘
                            │
                ┌───────────┴────────────┐
                ↓                        ↓
        ┌───────────────┐        ┌──────────────────┐
        │  MCP Services │        │  RESTful API     │
        │  (services/)  │        │  (restful-api/)  │
        └───────┬───────┘        └────────┬─────────┘
                │                         │
                └───────────┬─────────────┘
                            ↓
                    ┌───────────────┐
                    │   Supabase    │
                    │  (Database)   │
                    └───────────────┘
```

## 🛠️ 技术栈

### 核心依赖
- **@nuwa-ai/identity-kit** (^0.6.0) - 身份认证
- **@nuwa-ai/payment-kit** (link) - 支付和 MCP 服务器
- **@supabase/supabase-js** (^2.50.5) - 数据库
- **zod** (^3.25.0) - 数据验证

### 开发依赖
- **TypeScript** (~5.4.0)
- **tsx** (^4.7.0) - TypeScript 执行器
- **vitest** (^1.6.0) - 测试框架

## 📝 文档索引

| 文档 | 描述 | 目标读者 |
|------|------|----------|
| [API.md](./API.md) | API 接口文档 | API 使用者 |
| [QUICK_START.md](./QUICK_START.md) | 快速入门指南 | 新手 |
| [CURL_EXAMPLES.md](./CURL_EXAMPLES.md) | Curl 测试示例 | 测试人员 |
| [src/restful-api/README.md](./src/restful-api/README.md) | RESTful API 开发文档 | 开发者 |
| [CHANGES.md](./CHANGES.md) | 变更说明 | 所有人 |
| [REFACTORING.md](./REFACTORING.md) | 重构总结 | 开发者 |
| [PROJECT_STRUCTURE.md](./PROJECT_STRUCTURE.md) | 项目结构（本文档） | 所有人 |

## 🚀 快速导航

### 我想...

- **使用 API** → 查看 [API.md](./API.md) 或 [QUICK_START.md](./QUICK_START.md)
- **测试 API** → 查看 [CURL_EXAMPLES.md](./CURL_EXAMPLES.md)
- **添加新端点** → 查看 [src/restful-api/README.md](./src/restful-api/README.md)
- **了解变更** → 查看 [CHANGES.md](./CHANGES.md)
- **了解重构** → 查看 [REFACTORING.md](./REFACTORING.md)
- **理解架构** → 继续阅读本文档

## 🔧 开发指南

### 启动开发服务器
```bash
npm run dev
```

### 编译项目
```bash
npm run build
```

### 运行测试
```bash
npm test
```

### 运行 API 测试
```bash
./examples/test-api.sh
# 或
node examples/test-api.js
```

## 🌐 端口和端点

### 默认端口: 3000

| 端点 | 协议 | 描述 |
|------|------|------|
| `/health` | HTTP | 健康检查 |
| `/ready` | HTTP | 就绪检查 |
| `/mcp` | MCP | MCP 协议端点 |
| `/api/*` | REST | RESTful API 端点 |
| `/.well-known/nuwa-payment/info` | HTTP | 服务发现 |

## 📈 性能考虑

- RESTful API 和 MCP 协议共享同一个端口
- 数据库查询通过 Supabase 进行优化
- 支持分页查询，避免一次性加载过多数据
- CORS 预检请求直接返回，不进入业务逻辑

## 🔐 安全性

- RESTful API 仅暴露只读接口
- 写操作需要通过 MCP 协议进行身份验证
- 所有响应包含适当的 CORS 头
- 使用 TypeScript 进行类型安全

## 📅 更新日期

2025-10-28

