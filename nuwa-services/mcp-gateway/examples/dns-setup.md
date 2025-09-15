# DNS 配置指南

## 域名配置

假设你的域名是 `mcpproxy.xyz`，需要配置以下 DNS 记录：

### 方案一：使用 A 记录（推荐）

```
# 主域名
mcpproxy.xyz.        A    <Railway-IP-Address>

# 通配符子域名
*.mcpproxy.xyz.      A    <Railway-IP-Address>
```

### 方案二：使用 CNAME 记录

```
# 主域名
mcpproxy.xyz.        CNAME    <your-gateway>.railway.app

# 通配符子域名  
*.mcpproxy.xyz.      CNAME    <your-gateway>.railway.app
```

## Railway 配置

1. **部署网关服务**
   ```bash
   cd nuwa-services/mcp-gateway
   ./deploy.sh
   ```

2. **添加自定义域名**
   - 进入 Railway 项目控制台
   - 点击 "Settings" → "Domains"
   - 添加域名：`mcpproxy.xyz`
   - 添加通配符域名：`*.mcpproxy.xyz`

3. **获取 Railway IP**
   ```bash
   # 查看部署信息
   railway status
   
   # 或者 ping 获取 IP
   ping <your-gateway>.railway.app
   ```

## 常见 DNS 提供商配置

### Cloudflare

1. 登录 Cloudflare 控制台
2. 选择你的域名
3. 进入 "DNS" 页面
4. 添加记录：
   ```
   Type: A
   Name: @
   IPv4: <Railway-IP>
   Proxy: 关闭（灰色云朵）
   
   Type: A  
   Name: *
   IPv4: <Railway-IP>
   Proxy: 关闭（灰色云朵）
   ```

### 阿里云 DNS

1. 登录阿里云控制台
2. 进入 "云解析 DNS"
3. 选择你的域名
4. 添加记录：
   ```
   记录类型: A
   主机记录: @
   记录值: <Railway-IP>
   
   记录类型: A
   主机记录: *
   记录值: <Railway-IP>
   ```

### 腾讯云 DNS

1. 登录腾讯云控制台
2. 进入 "DNS 解析"
3. 选择你的域名
4. 添加记录：
   ```
   记录类型: A
   主机记录: @
   记录值: <Railway-IP>
   
   记录类型: A
   主机记录: *
   记录值: <Railway-IP>
   ```

## 验证配置

### 1. DNS 解析验证

```bash
# 检查主域名
dig mcpproxy.xyz

# 检查子域名
dig amap.mcpproxy.xyz
dig context7.mcpproxy.xyz

# 或使用 nslookup
nslookup mcpproxy.xyz
nslookup amap.mcpproxy.xyz
```

### 2. HTTP 访问验证

```bash
# 测试网关状态
curl https://mcpproxy.xyz/gateway/status

# 测试子域名路由
curl https://amap.mcpproxy.xyz/mcp \
  -X POST \
  -H "Content-Type: application/json" \
  -d '{"method": "tools/list"}'
```

### 3. 使用测试脚本

```bash
cd nuwa-services/mcp-gateway
./examples/test-gateway.sh https://mcpproxy.xyz
```

## 故障排除

### DNS 传播延迟

DNS 记录更新可能需要几分钟到几小时才能全球生效：

```bash
# 检查不同 DNS 服务器的解析结果
dig @8.8.8.8 mcpproxy.xyz        # Google DNS
dig @1.1.1.1 mcpproxy.xyz        # Cloudflare DNS
dig @114.114.114.114 mcpproxy.xyz # 114 DNS
```

### SSL 证书问题

Railway 会自动为自定义域名申请 SSL 证书，但可能需要几分钟时间：

1. 确保 DNS 记录正确指向 Railway
2. 等待 SSL 证书申请完成
3. 检查 Railway 控制台的域名状态

### 通配符域名不工作

某些 DNS 提供商可能不支持通配符 A 记录：

1. 尝试使用 CNAME 记录
2. 手动添加每个子域名的 A 记录
3. 联系 DNS 提供商确认通配符支持

## 高级配置

### CDN 加速

如果使用 Cloudflare 等 CDN：

1. 启用 Proxy（橙色云朵）
2. 配置缓存规则
3. 设置 SSL/TLS 模式为 "Full (strict)"

### 负载均衡

可以配置多个 Railway 实例实现负载均衡：

```
mcpproxy.xyz.    A    <Railway-IP-1>
mcpproxy.xyz.    A    <Railway-IP-2>
```

### 地理分布

使用 GeoDNS 将不同地区的用户路由到最近的服务器：

```
# 亚洲用户
mcpproxy.xyz.    A    <Asia-Railway-IP>

# 欧美用户  
mcpproxy.xyz.    A    <US-Railway-IP>
```
