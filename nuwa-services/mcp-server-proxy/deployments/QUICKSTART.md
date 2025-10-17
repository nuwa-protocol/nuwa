# MCP Server Proxy 部署快速开始

## 🚀 快速部署指南

### 前置条件

1. **安装 Railway CLI**
   ```bash
   npm install -g @railway/cli
   railway login
   ```

2. **准备环境**
   - Rooch 网络访问权限
   - 上游 MCP 服务的 API 密钥
   - 支付服务密钥

### 一键部署流程

#### 1. 创建新实例

```bash
# HTTP/HTTPS upstream (推荐用于远程服务)
./deployments/scripts/manage.sh create my-proxy httpStream

# Stdio upstream (用于本地命令)
./deployments/scripts/manage.sh create my-proxy stdio
```

#### 2. 配置实例

编辑生成的配置文件：
```bash
# 编辑配置
vim deployments/instances/my-proxy/config.yaml

# 查看环境变量示例
cat deployments/instances/my-proxy/env.example
```

#### 3. 部署到 Railway

```bash
./deployments/scripts/manage.sh deploy my-proxy
```

部署过程中会提示设置环境变量，例如：
```bash
railway variables set SERVICE_KEY=your_service_key_here
railway variables set UPSTREAM_API_TOKEN=your_api_token_here
```

#### 4. 验证部署

```bash
# 查看状态
./deployments/scripts/manage.sh status my-proxy

# 健康检查
./deployments/scripts/manage.sh health my-proxy

# 查看日志
./deployments/scripts/manage.sh logs my-proxy
```

## 📋 管理命令

### 实例管理

```bash
# 列出所有实例
./deployments/scripts/manage.sh list

# 查看实例状态
./deployments/scripts/manage.sh status [instance-name]

# 创建新实例
./deployments/scripts/manage.sh create <name> [httpStream|stdio]

# 部署实例
./deployments/scripts/manage.sh deploy <instance-name>

# 更新实例
./deployments/scripts/manage.sh update <instance-name>

# 批量更新所有实例
./deployments/scripts/manage.sh update-all

# 删除实例
./deployments/scripts/manage.sh delete <instance-name>
```

### 运维管理

```bash
# 查看日志
./deployments/scripts/manage.sh logs <instance-name>

# 管理环境变量
./deployments/scripts/manage.sh env <instance-name>

# 健康检查
./deployments/scripts/manage.sh health [instance-name]
```

## 🎯 预配置实例

### 高德地图代理 (amap-proxy)

```bash
# 部署高德地图代理
./deployments/scripts/manage.sh deploy amap-proxy

# 设置 API 密钥
railway variables set AMAP_API_KEY=your_amap_key_here
```

**支持的工具**：
- `amap.geo` - 地理编码 (0.0001 USD)
- `amap.regeocode` - 逆地理编码 (0.0001 USD)
- `amap.direction.*` - 路径规划 (0.0003-0.0005 USD)
- `amap.distance` - 距离测量 (0.00005 USD)

### GitHub 代理 (github-proxy)

```bash
# 部署 GitHub 代理
./deployments/scripts/manage.sh deploy github-proxy

# 设置 GitHub Token
railway variables set GITHUB_TOKEN=your_github_token_here
```

**支持的工具**：
- `github_search_repositories` - 搜索仓库 (免费)
- `github_get_file_contents` - 获取文件 (0.0001 USD)
- `github_create_issue` - 创建 Issue (0.002 USD)
- `github_create_pull_request` - 创建 PR (0.005 USD)

### Context7 代理 (context7-proxy)

```bash
# 部署 Context7 代理
./deployments/scripts/manage.sh deploy context7-proxy

# 基础环境变量（通常不需要额外的 API 密钥）
railway variables set SERVICE_KEY=your_service_key_here
```

**支持的工具**：
- `mcp_context7_resolve-library-id` - 库名称解析 (免费)
- `mcp_context7_get-library-docs` - 获取库文档 (0.0001 USD)

## 🔧 自定义配置

### HTTP/HTTPS Upstream 示例

```yaml
upstream:
  type: "httpStream"
  url: "https://api.example.com/mcp"
  auth:
    scheme: "bearer"
    token: "${API_TOKEN}"

register:
  tools:
    - name: "example.search"
      pricePicoUSD: "100000000"  # 0.0001 USD
    - name: "example.create"
      pricePicoUSD: "1000000000" # 0.001 USD
```

### Stdio Upstream 示例

**Node.js MCP 服务器：**
```yaml
upstream:
  type: "stdio"
  command: ["npx", "-y", "@example/mcp-server"]
  env:
    API_KEY: "${UPSTREAM_API_KEY}"
    DEBUG: "true"

register:
  tools:
    - name: "local.tool"
      pricePicoUSD: "500000000"  # 0.0005 USD
```

**Python MCP 服务器：**
```yaml
upstream:
  type: "stdio"
  command: ["uvx", "my-python-mcp-server"]
  env:
    PYTHON_API_KEY: "${PYTHON_API_KEY}"
    DEBUG: "true"

register:
  tools:
    - name: "python.tool"
      pricePicoUSD: "500000000"  # 0.0005 USD
```

## 💰 定价策略

### 推荐定价 (picoUSD)

| 操作类型 | 价格 (USD) | picoUSD 值 |
|----------|------------|------------|
| 简单查询 | $0.0001 | `100000000` |
| 数据检索 | $0.0005 | `500000000` |
| 数据创建 | $0.001 | `1000000000` |
| 复杂操作 | $0.005 | `5000000000` |
| 高级功能 | $0.01 | `10000000000` |

### 免费工具

设置 `pricePicoUSD: "0"` 使工具免费使用。

## 🔍 监控和调试

### 健康检查端点

```bash
# 基本健康检查
curl https://your-proxy.railway.app/health

# MCP 工具列表
curl https://your-proxy.railway.app/mcp \
  -X POST \
  -H "Content-Type: application/json" \
  -d '{"method": "tools/list"}'
```

### 日志监控

```bash
# 实时日志
railway logs --follow

# 错误日志
railway logs --filter error
```

### 性能监控

Railway 提供内置的性能监控：
- CPU 使用率
- 内存使用率
- 网络流量
- 响应时间

## 🚨 故障排除

### 常见问题

1. **部署失败**
   ```bash
   # 检查配置文件语法
   cat deployments/instances/my-proxy/config.yaml | yaml-lint
   
   # 检查环境变量
   railway variables
   ```

2. **Stdio upstream 无法启动**
   ```bash
   # 检查命令路径
   which npx
   
   # 测试本地执行
   npx @example/mcp-server
   ```

3. **支付功能异常**
   ```bash
   # 验证服务密钥
   echo $SERVICE_KEY | base64 -d
   
   # 检查网络连接
   curl -I $ROOCH_RPC_URL
   ```

### 获取帮助

```bash
# 查看所有可用命令
./deployments/scripts/manage.sh help

# Railway 帮助
railway help

# 查看实例配置
./deployments/scripts/manage.sh status my-proxy
```

## 🔗 相关链接

- [Railway 文档](https://docs.railway.app/)
- [MCP 协议规范](https://modelcontextprotocol.io/)
- [Rooch 网络文档](https://rooch.network/docs)
- [Nuwa 支付系统](https://github.com/rooch-network/nuwa)
