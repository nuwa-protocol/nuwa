# MCP Gateway 部署指南

## 概述

MCP Gateway 是一个基于子域名的路由网关服务，可以将不同子域名的请求路由到对应的 MCP 实例。例如：

- `amap.mcpproxy.xyz` → `amap-proxy.railway.app`
- `context7.mcpproxy.xyz` → `context7-proxy.railway.app`
- `github.mcpproxy.xyz` → `github-proxy.railway.app`

## 最简单的部署方案

### 方案架构

```
Internet → Railway Gateway → Individual MCP Instances
    ↓
amap.mcpproxy.xyz → Railway Project (Gateway) → amap-proxy instance
context7.mcpproxy.xyz → Railway Project (Gateway) → context7-proxy instance
github.mcpproxy.xyz → Railway Project (Gateway) → github-proxy instance
```

### 部署步骤

#### 1. 部署网关服务

```bash
# 进入网关目录
cd nuwa-services/mcp-gateway

# 安装依赖
pnpm install

# 部署到 Railway
./deploy.sh
```

#### 2. 配置域名

在你的域名提供商处配置 DNS 记录：

```
# 主域名指向 Railway
mcpproxy.xyz.     A     <railway-ip>

# 通配符子域名指向 Railway  
*.mcpproxy.xyz.   A     <railway-ip>
```

或使用 CNAME：

```
mcpproxy.xyz.     CNAME   <your-gateway>.railway.app
*.mcpproxy.xyz.   CNAME   <your-gateway>.railway.app
```

#### 3. 在 Railway 控制台添加自定义域名

1. 进入 Railway 项目设置
2. 点击 "Domains"
3. 添加域名：`mcpproxy.xyz`
4. 添加通配符域名：`*.mcpproxy.xyz`

#### 4. 配置实例

编辑 `config.yaml` 文件，添加你的 MCP 实例：

```yaml
instances:
  - name: "amap-proxy"
    subdomain: "amap"
    targetUrl: "https://amap-proxy.railway.app"
    enabled: true
    description: "Amap Maps MCP Proxy"

  - name: "context7-proxy"
    subdomain: "context7"
    targetUrl: "https://context7-proxy.railway.app"
    enabled: true
    description: "Context7 Documentation Library Proxy"
```

#### 5. 验证部署

```bash
# 测试网关状态
curl https://mcpproxy.xyz/gateway/status

# 测试子域名路由
curl https://amap.mcpproxy.xyz/mcp \
  -X POST \
  -H "Content-Type: application/json" \
  -d '{"method": "tools/list"}'
```

## 成本分析

### Railway 费用

- **Hobby 计划**：免费，适合开发测试
- **Pro 计划**：$5/月，适合生产环境
- **按使用量计费**：CPU 时间和流量

### 域名费用

- **.xyz 域名**：约 $10-15/年
- **.com 域名**：约 $15-20/年

### 总成本

- **开发环境**：免费（使用 Railway Hobby + 免费域名）
- **生产环境**：约 $5-10/月（Railway Pro + 域名费用）

## 优势

1. **简单易用**：一键部署，自动配置
2. **成本低廉**：比传统云服务便宜
3. **自动扩容**：Railway 自动处理负载
4. **SSL 证书**：自动申请和续期
5. **健康检查**：内置实例监控
6. **零运维**：无需管理服务器

## 替代方案

### 方案二：Cloudflare Workers + KV

适合更高级的用户，成本更低但配置复杂：

```javascript
// Cloudflare Worker
export default {
  async fetch(request, env) {
    const url = new URL(request.url);
    const subdomain = url.hostname.split('.')[0];
    
    const targetUrl = await env.INSTANCES.get(subdomain);
    if (!targetUrl) {
      return new Response('Instance not found', { status: 404 });
    }
    
    return fetch(targetUrl + url.pathname, request);
  }
}
```

### 方案三：Nginx + Docker

适合有服务器的用户：

```nginx
server {
    server_name ~^(?<subdomain>.+)\.mcpproxy\.xyz$;
    
    location / {
        resolver 8.8.8.8;
        set $target "https://$subdomain-proxy.railway.app";
        proxy_pass $target;
    }
}
```

## 监控和维护

### 健康检查

网关提供多个监控端点：

```bash
# 整体状态
GET /gateway/status

# 健康检查
GET /gateway/health

# 实例列表
GET /gateway/instances

# 单个实例健康状态
GET /gateway/health/:instance
```

### 日志查看

```bash
# Railway 日志
railway logs

# 实时日志
railway logs --follow
```

### 更新实例

1. 修改 `config.yaml`
2. 重新部署：`railway up`

## 故障排除

### 常见问题

1. **子域名无法访问**
   - 检查 DNS 配置
   - 确认 Railway 域名设置
   - 验证实例配置

2. **SSL 证书问题**
   - 等待 Railway 自动申请证书
   - 检查域名 DNS 解析

3. **实例健康检查失败**
   - 检查目标 URL 可访问性
   - 验证健康检查路径

### 调试模式

```bash
# 启用调试日志
railway variables set DEBUG=true
```

## 扩展功能

### 负载均衡

配置多个实例使用相同子域名：

```yaml
instances:
  - name: "api-1"
    subdomain: "api"
    targetUrl: "https://api-1.railway.app"
  - name: "api-2"
    subdomain: "api"
    targetUrl: "https://api-2.railway.app"
```

### 地理分布

使用 GeoDNS 将不同地区用户路由到最近服务器。

### 缓存优化

在 Cloudflare 等 CDN 前添加缓存层。

## 总结

Railway + 子域名网关是部署 MCP 服务最简单、成本最低的方案：

- ✅ 一键部署
- ✅ 自动扩容
- ✅ SSL 证书
- ✅ 健康监控
- ✅ 成本低廉
- ✅ 零运维

推荐用于生产环境！
