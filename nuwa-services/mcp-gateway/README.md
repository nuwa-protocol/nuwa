# MCP Gateway Service

MCP Gateway 是一个基于子域名的路由网关，将请求转发到相应的 MCP 实例。

## 功能特性

- **子域名路由**：根据子域名自动路由到对应的 MCP 实例
- **健康检查**：定期检查实例健康状态
- **负载均衡**：智能路由到健康的实例
- **监控面板**：提供实例状态和健康信息
- **动态配置**：支持热更新实例配置

## 架构设计

```
Internet → MCP Gateway → MCP Instances
    ↓
amap.mcpproxy.xyz → Gateway → amap-proxy.railway.app
context7.mcpproxy.xyz → Gateway → context7-proxy.railway.app
github.mcpproxy.xyz → Gateway → github-proxy.railway.app
```

## 快速开始

### 1. 安装依赖

```bash
cd nuwa-services/mcp-gateway
pnpm install
```

### 2. 配置

编辑 `config.yaml` 文件：

```yaml
# Gateway server settings
port: 8080
baseDomain: "mcpproxy.xyz"

# MCP Instance configurations
instances:
  - name: "amap-proxy"
    subdomain: "amap"
    targetUrl: "https://amap-proxy.railway.app"
    enabled: true
    description: "Amap Maps MCP Proxy"
```

### 3. 运行

```bash
# 开发模式
pnpm dev

# 生产模式
pnpm build
pnpm start
```

## 部署到 Railway

### 1. 创建 Railway 项目

```bash
railway login
railway init mcp-gateway
```

### 2. 配置环境变量

```bash
railway variables set PORT=8080
railway variables set DEBUG=false
```

### 3. 部署

```bash
railway up
```

### 4. 配置自定义域名

在 Railway 控制台中：
1. 进入项目设置
2. 添加自定义域名：`mcpproxy.xyz`
3. 配置 DNS 记录

## DNS 配置

在你的域名提供商处配置以下 DNS 记录：

```
# 主域名指向 Railway
mcpproxy.xyz.     A     <railway-ip>

# 通配符子域名指向 Railway
*.mcpproxy.xyz.   A     <railway-ip>
```

或使用 CNAME：

```
mcpproxy.xyz.     CNAME   <railway-domain>
*.mcpproxy.xyz.   CNAME   <railway-domain>
```

## API 端点

### 网关状态

```bash
GET /gateway/status
```

返回网关和所有实例的状态信息。

### 健康检查

```bash
GET /gateway/health
```

返回网关整体健康状态。

```bash
GET /gateway/health/:instance
```

返回特定实例的健康状态。

### 实例发现

```bash
GET /gateway/instances
```

返回所有配置的实例列表。

## 使用示例

### 访问 Amap 服务

```bash
# 通过网关访问
curl https://amap.mcpproxy.xyz/mcp \
  -X POST \
  -H "Content-Type: application/json" \
  -d '{"method": "tools/list"}'
```

### 访问 Context7 服务

```bash
# 通过网关访问
curl https://context7.mcpproxy.xyz/mcp \
  -X POST \
  -H "Content-Type: application/json" \
  -d '{"method": "tools/list"}'
```

## 配置说明

### 实例配置

```yaml
instances:
  - name: "service-name"        # 实例名称
    subdomain: "subdomain"      # 子域名
    targetUrl: "https://..."    # 目标 URL
    healthPath: "/health"       # 健康检查路径
    enabled: true               # 是否启用
    description: "描述"         # 描述信息
```

### 健康检查配置

```yaml
healthCheck:
  interval: 30  # 检查间隔（秒）
  timeout: 10   # 超时时间（秒）
```

## 监控和调试

### 查看日志

```bash
# Railway 日志
railway logs

# 本地调试
DEBUG=true pnpm dev
```

### 健康检查

```bash
# 检查网关状态
curl https://mcpproxy.xyz/gateway/status

# 检查特定实例
curl https://mcpproxy.xyz/gateway/health/amap-proxy
```

## 故障排除

### 常见问题

1. **子域名无法访问**
   - 检查 DNS 配置是否正确
   - 确认通配符域名已配置
   - 验证实例配置是否启用

2. **实例健康检查失败**
   - 检查目标 URL 是否可访问
   - 验证健康检查路径是否正确
   - 查看实例日志

3. **代理请求失败**
   - 检查目标服务是否正常运行
   - 验证网络连接
   - 查看网关日志

### 调试模式

启用调试模式查看详细日志：

```bash
DEBUG=true pnpm start
```

## 扩展功能

### 添加新实例

1. 在 `config.yaml` 中添加实例配置
2. 重启网关服务
3. 验证新实例可访问

### 负载均衡

可以配置多个实例使用相同的子域名实现负载均衡：

```yaml
instances:
  - name: "service-1"
    subdomain: "api"
    targetUrl: "https://service-1.railway.app"
    enabled: true
  - name: "service-2"
    subdomain: "api"
    targetUrl: "https://service-2.railway.app"
    enabled: true
```

## 安全考虑

- 使用 HTTPS 加密传输
- 配置适当的 CORS 策略
- 实施访问控制和限流
- 定期更新依赖包

## 相关链接

- [Railway 文档](https://docs.railway.app/)
- [MCP 协议规范](https://modelcontextprotocol.io/)
- [Fastify 文档](https://www.fastify.io/)
