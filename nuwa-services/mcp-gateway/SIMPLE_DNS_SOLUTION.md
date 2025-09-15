# 最简单方案：直接 DNS 配置

## 🎯 重新评估后的最佳方案

经过确认 Cloudflare Workers 不支持通配符域名后，**直接 DNS 配置**反而成为了最简单的方案。

## 🚀 超简单部署（5分钟完成）

### 方案：直接 DNS 指向

每个子域名直接指向对应的 Railway 实例，无需网关代理。

```
amap.mcpproxy.xyz → amap-proxy.railway.app (CNAME)
context7.mcpproxy.xyz → context7-proxy.railway.app (CNAME)
github.mcpproxy.xyz → github-proxy.railway.app (CNAME)
```

### 配置步骤

1. **在域名提供商处配置 DNS**：

```
# 方式一：使用 CNAME（推荐）
amap.mcpproxy.xyz.      CNAME   amap-proxy.railway.app.
context7.mcpproxy.xyz.  CNAME   context7-proxy.railway.app.
github.mcpproxy.xyz.    CNAME   github-proxy.railway.app.

# 方式二：使用 A 记录
amap.mcpproxy.xyz.      A       <amap-proxy-ip>
context7.mcpproxy.xyz.  A       <context7-proxy-ip>
github.mcpproxy.xyz.    A       <github-proxy-ip>
```

2. **在 Railway 中添加自定义域名**：

对每个实例：
- 进入 Railway 项目设置
- 添加自定义域名：`amap.mcpproxy.xyz`
- Railway 会自动申请 SSL 证书

3. **完成！**

## ✅ 优势

- **零成本**：完全免费
- **零代码**：无需开发任何代码
- **零运维**：无需管理网关服务
- **自动 HTTPS**：Railway 自动提供 SSL 证书
- **高性能**：直连，无额外延迟
- **高可用**：每个实例独立，互不影响

## 📊 方案对比更新

| 方案 | 成本 | 复杂度 | 维护 | 推荐度 |
|------|------|--------|------|--------|
| **🥇 直接 DNS 配置** | **免费** | **极简** | **零** | **⭐⭐⭐⭐⭐** |
| 🥈 Cloudflare Workers | 免费 | 中等* | 低 | ⭐⭐⭐ |
| 🥉 自建网关 | $5-10/月 | 复杂 | 高 | ⭐⭐ |

*需要手动配置每个子域名

## 🔧 具体操作示例

### 阿里云 DNS 配置

1. 登录阿里云控制台
2. 进入"云解析 DNS"
3. 选择域名 `mcpproxy.xyz`
4. 添加记录：

```
记录类型: CNAME
主机记录: amap
记录值: amap-proxy.railway.app
TTL: 600

记录类型: CNAME  
主机记录: context7
记录值: context7-proxy.railway.app
TTL: 600
```

### Cloudflare DNS 配置

1. 登录 Cloudflare 控制台
2. 选择域名 `mcpproxy.xyz`
3. 进入"DNS"页面
4. 添加记录：

```
Type: CNAME
Name: amap
Target: amap-proxy.railway.app
Proxy status: DNS only (灰色云朵)

Type: CNAME
Name: context7  
Target: context7-proxy.railway.app
Proxy status: DNS only (灰色云朵)
```

### Railway 域名配置

对每个 MCP 实例项目：

1. 进入项目设置 → Domains
2. 点击"Add Domain"
3. 输入：`amap.mcpproxy.xyz`
4. 等待 SSL 证书自动申请（通常几分钟）

## 🧪 验证配置

```bash
# 检查 DNS 解析
dig amap.mcpproxy.xyz
dig context7.mcpproxy.xyz

# 测试 HTTPS 访问
curl https://amap.mcpproxy.xyz/mcp \
  -X POST \
  -H "Content-Type: application/json" \
  -d '{"method": "tools/list"}'

curl https://context7.mcpproxy.xyz/mcp \
  -X POST \
  -H "Content-Type: application/json" \
  -d '{"method": "tools/list"}'
```

## 🔄 添加新实例

当需要添加新的 MCP 实例时：

1. **部署新实例到 Railway**
2. **添加 DNS 记录**：`newservice.mcpproxy.xyz → newservice-proxy.railway.app`
3. **在 Railway 添加自定义域名**：`newservice.mcpproxy.xyz`
4. **完成**

## 🎉 总结

这个方案的优势：

- ✅ **最简单**：只需配置 DNS，无需任何代码
- ✅ **最便宜**：完全免费
- ✅ **最稳定**：直连，无单点故障
- ✅ **最快速**：5分钟完成配置
- ✅ **最灵活**：每个实例独立管理

**结论**：直接 DNS 配置是最优方案，无需开发任何网关代码！
