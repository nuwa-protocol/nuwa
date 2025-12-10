# Nuwa Discord Interactions Service

一个可部署到 Railway 的独立服务，提供 `/api/discord/interactions` 端点以处理 Discord 交互事件，功能等同于 `website/docs/app/api/discord/interactions`。

## 运行

1. 安装依赖

```bash
pnpm install
```

2. 本地启动

```bash
pnpm dev
```

3. 生产构建与启动

```bash
pnpm build && pnpm start
```

## 环境变量

- `PORT`: 监听端口（Railway 会注入）
- `DISCORD_APP_PUBLIC_KEY`: Discord 应用公钥（用于签名验证）
- `FAUCET_URL`: 测试网水龙头地址（默认 `https://test-faucet.rooch.network`）
- `ROOCH_RPC_URL`: Rooch RPC（默认 `https://test-seed.rooch.network`）
- `HUB_PRIVATE_KEY`: Hub 账户私钥（用于转账）
- `HUB_DID`: Hub 账户 DID（`did:rooch:<address>`）

## 路由

- `GET /health`: 健康检查
- `POST /api/discord/interactions`: Discord 交互入口

## Railway 部署

- 选择 Nixpacks 构建，自动读取 `nixpacks.toml`
- 设置上述环境变量
- 使用默认 Start Command：`pnpm run start`
