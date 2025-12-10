# Context7 MCP Proxy

Context7 是一个提供最新库文档的 MCP 服务器，支持获取各种编程库的最新文档和代码示例。

## 功能特性

- **库解析**：根据库名称解析为 Context7 兼容的库 ID
- **文档获取**：获取指定库的最新文档内容
- **多语言支持**：支持各种编程语言的库
- **实时更新**：提供最新的库文档和 API 信息

## 配置说明

### Upstream 配置

```yaml
upstream:
  type: 'stdio'
  command: ['npx', '-y', '@upstash/context7-mcp@latest']
```

Context7 MCP 服务器通过 stdio 方式运行，使用 npx 直接运行最新版本。

### 工具定价

- `mcp_context7_resolve-library-id`: **免费** - 库名称解析
- `mcp_context7_get-library-docs`: **0.0001 USD** - 文档获取（基础价格）

## 部署步骤

1. **部署到 Railway**

   ```bash
   ./deployments/scripts/manage.sh deploy context7-proxy
   ```

2. **设置环境变量**

   ```bash
   # 基础配置
   railway variables set SERVICE_KEY=your_service_key_here
   railway variables set ROOCH_RPC_URL=https://test-seed.rooch.network

   # 如果 Context7 需要 API 密钥
   # railway variables set CONTEXT7_API_KEY=your_api_key_here
   ```

3. **验证部署**

   ```bash
   # 检查状态
   ./deployments/scripts/manage.sh status context7-proxy

   # 健康检查
   ./deployments/scripts/manage.sh health context7-proxy
   ```

## 使用示例

### 1. 解析库 ID

```bash
curl https://context7-proxy.railway.app/mcp \
  -X POST \
  -H "Content-Type: application/json" \
  -d '{
    "method": "tools/call",
    "params": {
      "name": "mcp_context7_resolve-library-id",
      "arguments": {
        "libraryName": "react"
      }
    }
  }'
```

### 2. 获取库文档

```bash
curl https://context7-proxy.railway.app/mcp \
  -X POST \
  -H "Content-Type: application/json" \
  -d '{
    "method": "tools/call",
    "params": {
      "name": "mcp_context7_get-library-docs",
      "arguments": {
        "context7CompatibleLibraryID": "/facebook/react",
        "topic": "hooks",
        "tokens": 5000
      }
    }
  }'
```

## 监控和维护

### 日志监控

```bash
# 查看实时日志
./deployments/scripts/manage.sh logs context7-proxy

# 检查错误
railway logs --filter error
```

### 性能优化

- Context7 服务器会缓存文档内容
- 合理设置 `tokens` 参数以控制响应大小
- 监控内存使用情况

### 故障排除

1. **服务无法启动**

   ```bash
   # 检查 npx 是否可用
   railway shell
   npx --version

   # 测试 Context7 包
   npx -y @upstash/context7-mcp@latest --help
   ```

2. **文档获取失败**
   - 检查库 ID 是否正确
   - 验证网络连接
   - 查看详细错误日志

## 相关链接

- [Context7 官方文档](https://upstash.com/docs/context7)
- [Context7 MCP 服务器](https://github.com/upstash/context7-mcp)
- [MCP 协议规范](https://modelcontextprotocol.io/)
