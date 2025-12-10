# MCP Server Proxy 多实例部署指南

本目录包含了 MCP Server Proxy 的多实例部署配置和脚本。

## 部署架构

### 方案选择

经过分析，我们推荐使用 **Railway** 作为主要部署平台，原因如下：

1. **完整功能支持**：
   - ✅ 支持 stdio upstream（子进程）
   - ✅ 支持长连接和 WebSocket
   - ✅ 支持所有 Node.js 特性

2. **Cloudflare Workers 限制**：
   - ❌ 不支持 stdio upstream（无法运行 `command: ["python", "script.py"]`）
   - ❌ CPU 时间限制（10ms-30s）
   - ❌ 内存限制（128MB）
   - ❌ 不支持长连接

## 多实例管理

### 实例配置结构

```
deployments/
├── instances/
│   ├── amap-proxy/           # 高德地图 MCP 代理
│   ├── github-proxy/         # GitHub MCP 代理
│   ├── context7-proxy/       # Context7 文档库代理
│   └── custom-proxy/         # 自定义 MCP 代理
├── scripts/
│   ├── deploy.sh            # 部署脚本
│   ├── update-all.sh        # 批量更新
│   └── create-instance.sh   # 创建新实例
└── templates/
    ├── railway.json.template
    └── config.yaml.template
```

### 实例配置示例

每个实例目录包含：

1. **`railway.json`** - Railway 部署配置
2. **`config.yaml`** - MCP Proxy 配置
3. **`env.example`** - 环境变量示例

### 部署流程

1. **创建新实例**：

   ```bash
   ./scripts/create-instance.sh my-new-proxy
   ```

2. **配置实例**：
   编辑 `instances/my-new-proxy/config.yaml`

3. **部署实例**：

   ```bash
   ./scripts/deploy.sh my-new-proxy
   ```

4. **批量更新**：
   ```bash
   ./scripts/update-all.sh
   ```

## 环境变量管理

### 通用环境变量

- `CONFIG_PATH` - 配置文件路径
- `SERVICE_KEY` - 支付服务密钥
- `ROOCH_RPC_URL` - Rooch RPC 端点
- `DEBUG` - 调试模式

### 实例特定变量

每个实例可以有自己的：

- `UPSTREAM_API_KEY` - 上游服务 API 密钥
- `CUSTOM_CONFIG` - 自定义配置
- `INSTANCE_NAME` - 实例名称

## 监控和日志

### Railway 内置功能

- 自动日志收集
- 性能监控
- 健康检查
- 自动重启

### 自定义监控

可以通过 `nuwa.health` 端点进行健康检查：

```bash
curl https://my-proxy.railway.app/mcp -X POST \
  -H "Content-Type: application/json" \
  -d '{"method": "tools/list"}'
```

## 成本优化

### Railway 定价策略

- 使用 Hobby 计划进行开发测试
- 生产环境使用 Pro 计划
- 按实际使用量付费

### 资源优化

- 合理设置内存限制
- 使用环境变量控制功能开关
- 实施请求缓存和限流

## 安全考虑

### 网络安全

- 使用 HTTPS（Railway 自动提供）
- 配置 CORS 策略
- 实施 API 密钥验证

### 数据安全

- 环境变量存储敏感信息
- 使用 DIDAuth 进行身份验证
- 定期轮换 API 密钥

## 故障排除

### 常见问题

1. **Stdio upstream 无法启动**
   - 检查 command 路径
   - 验证依赖安装
   - 查看进程日志

2. **支付功能异常**
   - 验证 SERVICE_KEY 配置
   - 检查 Rooch 网络连接
   - 确认余额充足

3. **性能问题**
   - 监控内存使用
   - 检查上游响应时间
   - 优化请求缓存

### 调试命令

```bash
# 查看实例状态
railway status

# 查看日志
railway logs

# 连接到实例
railway shell
```
