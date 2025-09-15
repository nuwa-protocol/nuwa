# Nginx 网关方案

## 适用场景

如果你需要：
- 统一的访问日志
- 统一的访问控制
- 统一的缓存策略
- 统一的监控

可以考虑使用 Nginx 作为网关。

## 🚀 部署步骤

### 1. 准备服务器

```bash
# Ubuntu/Debian
sudo apt update
sudo apt install nginx certbot python3-certbot-nginx

# CentOS/RHEL
sudo yum install nginx certbot python3-certbot-nginx
```

### 2. 配置 Nginx

创建配置文件 `/etc/nginx/sites-available/mcp-gateway`：

```nginx
# 通配符服务器块 - 处理所有子域名
server {
    listen 80;
    server_name *.mcpproxy.xyz;
    
    # 重定向到 HTTPS
    return 301 https://$server_name$request_uri;
}

server {
    listen 443 ssl http2;
    server_name *.mcpproxy.xyz;
    
    # SSL 配置（通配符证书）
    ssl_certificate /etc/letsencrypt/live/mcpproxy.xyz/fullchain.pem;
    ssl_certificate_key /etc/letsencrypt/live/mcpproxy.xyz/privkey.pem;
    
    # 根据子域名路由
    location / {
        # 提取子域名
        set $subdomain "";
        if ($host ~* ^([^.]+)\.mcpproxy\.xyz$) {
            set $subdomain $1;
        }
        
        # 路由到对应实例
        if ($subdomain = "amap") {
            proxy_pass https://amap-proxy.railway.app;
        }
        if ($subdomain = "context7") {
            proxy_pass https://context7-proxy.railway.app;
        }
        if ($subdomain = "github") {
            proxy_pass https://github-proxy.railway.app;
        }
        
        # 默认处理
        if ($subdomain = "") {
            return 404;
        }
        
        # 代理设置
        proxy_set_header Host $proxy_host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
        
        # 支持 WebSocket 和 SSE
        proxy_http_version 1.1;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection "upgrade";
        proxy_buffering off;
        proxy_cache off;
    }
}
```

### 3. 启用配置

```bash
# 启用站点
sudo ln -s /etc/nginx/sites-available/mcp-gateway /etc/nginx/sites-enabled/

# 测试配置
sudo nginx -t

# 重启 Nginx
sudo systemctl restart nginx
```

### 4. 申请 SSL 证书

```bash
# 申请通配符证书（需要 DNS 验证）
sudo certbot certonly --manual --preferred-challenges dns -d "*.mcpproxy.xyz" -d "mcpproxy.xyz"

# 按提示添加 DNS TXT 记录进行验证
```

### 5. 配置 DNS

```
# 所有子域名指向 Nginx 服务器
*.mcpproxy.xyz.    A    <nginx-server-ip>
mcpproxy.xyz.      A    <nginx-server-ip>
```

## 📊 成本分析

- **VPS 服务器**：$5-20/月
- **域名**：$10-15/年
- **SSL 证书**：免费（Let's Encrypt）
- **总成本**：$5-20/月

## ✅ 优势

- 支持真正的通配符域名
- 统一的访问控制和日志
- 灵活的路由规则
- 支持缓存和负载均衡

## ❌ 劣势

- 需要维护服务器
- 单点故障风险
- 额外的运维成本
