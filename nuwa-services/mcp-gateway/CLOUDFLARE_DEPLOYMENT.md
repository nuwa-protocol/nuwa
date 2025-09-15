# Cloudflare Workers 部署指南

## 为什么选择 Cloudflare Workers？

经过调研，发现 **Cloudflare Workers** 是实现子域名路由网关的最佳方案：

### ✅ 优势
- **完全免费**：100,000 请求/天免费额度
- **零运维**：无需管理服务器
- **全球 CDN**：自动全球分发，低延迟
- **自动 HTTPS**：免费 SSL 证书
- **极简部署**：几分钟完成部署
- **高可用**：99.9% 可用性保证

### 📊 成本对比

| 方案 | 月成本 | 运维复杂度 | 可用性 |
|------|--------|------------|--------|
| **Cloudflare Workers** | **免费** | **零运维** | **99.9%** |
| Railway + 自建网关 | $5-10 | 中等 | 95% |
| VPS + Nginx | $10-20 | 高 | 90% |
| AWS API Gateway | $15-50 | 中等 | 99.9% |

## 🚀 部署步骤

### 1. 准备工作

1. **注册 Cloudflare 账号**
   - 访问 [cloudflare.com](https://cloudflare.com)
   - 注册免费账号

2. **添加域名到 Cloudflare**
   - 在 Cloudflare 控制台添加你的域名 `mcpproxy.xyz`
   - 按提示修改域名的 NS 记录到 Cloudflare

### 2. 部署 Worker

1. **进入 Workers 控制台**
   - 登录 Cloudflare 控制台
   - 点击左侧 "Workers & Pages"
   - 点击 "Create application"

2. **创建新 Worker**
   - 选择 "Create Worker"
   - 名称：`mcp-gateway`
   - 点击 "Deploy"

3. **编辑 Worker 代码**
   - 点击 "Edit code"
   - 删除默认代码
   - 复制粘贴 `cloudflare-worker.js` 的内容
   - 点击 "Save and deploy"

### 3. 配置自定义域名

1. **添加自定义域名**
   - 在 Worker 设置中点击 "Triggers"
   - 点击 "Add Custom Domain"
   - 输入：`mcpproxy.xyz`
   - 点击 "Add Custom Domain"

2. **添加子域名（需要逐个添加）**
   
   ⚠️ **重要**：Cloudflare Workers 不支持通配符域名 `*.mcpproxy.xyz`
   
   需要为每个实例手动添加：
   - 点击 "Add Custom Domain"
   - 输入：`amap.mcpproxy.xyz`
   - 点击 "Add Custom Domain"
   - 重复为每个子域名：`context7.mcpproxy.xyz`、`github.mcpproxy.xyz` 等

### 4. 配置实例

编辑 Worker 代码中的 `MCP_INSTANCES` 配置：

```javascript
const MCP_INSTANCES = {
  'amap': 'https://amap-proxy.railway.app',
  'context7': 'https://context7-proxy.railway.app',
  'github': 'https://github-proxy.railway.app',
  // 添加更多实例...
};
```

### 5. 验证部署

```bash
# 测试网关状态
curl https://mcpproxy.xyz/gateway/status

# 测试子域名路由
curl https://amap.mcpproxy.xyz/mcp \
  -X POST \
  -H "Content-Type: application/json" \
  -d '{"method": "tools/list"}'
```

## 📝 配置说明

### 实例配置

在 Worker 代码中修改 `MCP_INSTANCES` 对象：

```javascript
const MCP_INSTANCES = {
  // 子域名: 目标URL
  'amap': 'https://amap-proxy.railway.app',
  'context7': 'https://context7-proxy.railway.app',
  'custom': 'https://custom-service.example.com',
};
```

### 基础域名配置

修改 `extractSubdomain` 函数中的基础域名：

```javascript
const baseDomain = 'your-domain.com'; // 改为你的域名
```

## 🔧 高级配置

### 1. 环境变量（可选）

Cloudflare Workers 支持环境变量，可以将配置外部化：

1. 在 Worker 设置中点击 "Variables"
2. 添加环境变量：
   ```
   AMAP_TARGET = https://amap-proxy.railway.app
   CONTEXT7_TARGET = https://context7-proxy.railway.app
   ```

3. 修改 Worker 代码使用环境变量：
   ```javascript
   const MCP_INSTANCES = {
     'amap': env.AMAP_TARGET,
     'context7': env.CONTEXT7_TARGET,
   };
   ```

### 2. KV 存储（动态配置）

使用 Cloudflare KV 实现动态实例配置：

1. 创建 KV 命名空间：`MCP_INSTANCES`
2. 在 Worker 中绑定 KV
3. 修改代码从 KV 读取配置

### 3. 访问控制

添加简单的访问控制：

```javascript
// 检查 API 密钥
const apiKey = request.headers.get('X-API-Key');
if (apiKey !== env.API_KEY) {
  return new Response('Unauthorized', { status: 401 });
}
```

## 📊 监控和分析

### 1. 内置分析

Cloudflare 提供免费的分析功能：
- 请求数量和错误率
- 响应时间分布
- 地理分布统计

### 2. 日志查看

在 Worker 控制台可以查看：
- 实时日志
- 错误日志
- 性能指标

### 3. 告警设置

可以设置告警规则：
- 错误率超过阈值
- 响应时间过长
- 请求量异常

## 🚨 故障排除

### 常见问题

1. **域名解析失败**
   - 确认域名已添加到 Cloudflare
   - 检查 NS 记录是否正确

2. **Worker 无法访问**
   - 检查自定义域名配置
   - 确认 Worker 已部署

3. **代理请求失败**
   - 检查目标 URL 是否可访问
   - 查看 Worker 日志

### 调试技巧

1. **添加日志**：
   ```javascript
   console.log('Request:', request.url);
   console.log('Target:', targetUrl);
   ```

2. **测试模式**：
   ```javascript
   if (url.searchParams.get('debug') === '1') {
     return new Response(JSON.stringify({
       subdomain,
       targetUrl,
       headers: Object.fromEntries(request.headers)
     }));
   }
   ```

## 🔄 更新和维护

### 添加新实例

1. 编辑 Worker 代码
2. 在 `MCP_INSTANCES` 中添加新配置
3. 保存并部署

### 批量更新

使用 Wrangler CLI 工具：

```bash
# 安装 Wrangler
npm install -g wrangler

# 登录
wrangler login

# 部署
wrangler deploy
```

## 💡 最佳实践

1. **版本控制**：将 Worker 代码保存在 Git 仓库
2. **环境分离**：使用不同的 Worker 用于开发和生产
3. **监控告警**：设置关键指标的告警
4. **定期备份**：备份 Worker 配置和代码
5. **性能优化**：使用 KV 缓存减少外部请求

## 📈 扩展功能

### 1. 负载均衡

```javascript
const MCP_INSTANCES = {
  'api': [
    'https://api-1.railway.app',
    'https://api-2.railway.app'
  ]
};

// 随机选择实例
function getTargetUrl(subdomain) {
  const targets = MCP_INSTANCES[subdomain];
  if (Array.isArray(targets)) {
    return targets[Math.floor(Math.random() * targets.length)];
  }
  return targets;
}
```

### 2. 健康检查

```javascript
// 定期检查实例健康状态
async function healthCheck(targetUrl) {
  try {
    const response = await fetch(targetUrl + '/health', { 
      method: 'GET',
      signal: AbortSignal.timeout(5000)
    });
    return response.ok;
  } catch {
    return false;
  }
}
```

### 3. 缓存优化

```javascript
// 缓存响应
const cache = caches.default;
const cacheKey = new Request(request.url, request);
const cachedResponse = await cache.match(cacheKey);

if (cachedResponse) {
  return cachedResponse;
}
```

## 总结

Cloudflare Workers 方案具有以下优势：

- ✅ **零成本**：完全免费
- ✅ **零运维**：无需管理服务器
- ✅ **高性能**：全球 CDN 加速
- ✅ **高可用**：99.9% 可用性
- ✅ **易扩展**：支持动态配置
- ✅ **安全性**：自动 HTTPS 和 DDoS 防护

这是目前最优的解决方案！
