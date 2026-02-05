# did-check example (Rooch testnet)

This example shows a minimal did-check service using `@nuwa-ai/identity-kit` for DID authentication. It targets deployments like `did-check.nuwa.dev`, providing only public health/info plus a single protected `/whoami`. Defaults are set to **Rooch mainnet** and CADOP domain `id.nuwa.dev`.

## 🎯 What This Example Shows

- **Server Side**: Express server with DID authentication middleware
- **Client Side**: CLI client for authenticated requests (optional)
- **CADOP Integration**: Deep-link flow for key authorization

## 📁 Project Structure

```
did-check/
├── src/
│   ├── server.ts           # Express server with DID auth middleware
│   └── client-cli.ts       # CLI client for authenticated requests
├── package.json
├── tsconfig.json
├── env.example
└── README.md
```

## 🚀 Quick Start

### 1. Prerequisites

- Node.js 18+ installed
- A Rooch network connection (**mainnet** by default)

### 2. Setup

```bash
# Navigate to the example directory
cd nuwa-kit/typescript/examples/did-check

# Install dependencies
pnpm install

# Copy environment variables (optional, defaults are mainnet)
cp env.example .env
```

### 3. Start the Server

```bash
# Development mode
pnpm dev:server

# Or build and run
pnpm build
pnpm start:server
```

The server will start on `http://localhost:3004`. No service key is required - the server only needs to resolve DID documents for verification.

### 4. Use the CLI Client (optional)

```bash
pnpm dev:client
```

### 5. Remote Agent + 用户不同设备（无本地回调）最小流程（Rooch testnet）

这套流程不依赖本地回调/请求 ID，由用户把 DID 文本返回给 Agent 即可：

1. **Agent 生成密钥**：在 `nuwa-kit/typescript/examples/did-auth-agent` 下运行 `node generate-keys.js`（得到 `agent-key.pem` / `agent-pub.pem`）。  
2. **用户绑定公钥**：将 `agent-pub.pem` 内容发送给用户，用户在 `id.nuwa.dev`（测试网）把该公钥添加到自己的 Rooch DID 的 `authentication`（可使用 fragment `#key-1` 或自定义）。  
3. **用户返回 DID**：用户把自己的 DID 字符串（如 `did:rooch:0x...`）发给 Agent。  
4. **Agent 验证绑定**：Agent 用 `identity-kit` 的 VDR 解析该 DID，确认 `verificationMethod.id` / `authentication` 中包含刚才的 `key_id`。示例代码（Node REPL）：
   ```ts
   import { IdentityKit, VDRRegistry } from '@nuwa-ai/identity-kit';
   await IdentityKit.bootstrap({ method: 'rooch', vdrOptions: { network: 'test' } });
   const doc = await VDRRegistry.getInstance().resolve('<USER_DID>');
   console.log(doc.authentication);
   ```
5. **Agent 发请求（纯 Node 头生成）**：在 `nuwa-kit/typescript/examples/did-auth-agent` 目录：
   ```bash
   BODY='{"hello":"world"}'
   AUTH=$(node didauth.js --did <USER_DID> --key agent-key.pem \
     --aud http://localhost:3004 --method GET --path /whoami --body "$BODY")
   curl -X GET http://localhost:3004/whoami \
     -H "Authorization: $AUTH" -H "Content-Type: application/json"
   ```
6. **服务器验证**：本示例的 Express 中间件使用 `DIDAuth.v1.verifyAuthHeader`（Rooch testnet 解析）验证时间戳、nonce、防重放、方法/路径/体哈希等，并返回 whoami。

> 提示：`didauth.js` 与 deep-link 脚本在 `nuwa-kit/typescript/examples/did-auth-agent`，方便复制到任意 Agent 运行环境；服务器端直接复用本示例的中间件即可。

## 📡 API Endpoints

### Public Endpoints
- `GET /health` - Health check
- `GET /info` - Service information

### Protected Endpoint (Requires DID Auth)
- `GET /whoami` - Returns authenticated caller's DID

## 🔐 Authentication Flow

1. **Client** creates a signed object using `DIDAuth.v1.createSignature()`
2. **Client** converts to Authorization header using `DIDAuth.v1.toAuthorizationHeader()`
3. **Server** verifies header using `DIDAuth.v1.verifyAuthHeader()`
4. **Server** extracts caller DID from verified signature

### Authorization Header Format

```
Authorization: DIDAuthV1 <base64url-encoded-signed-object>
```

## 🔧 Configuration (recommended for a did-check deployment)

### Environment Variables

| Variable        | Description                 | Default                        |
| --------------- | --------------------------- | ------------------------------ |
| `ROOCH_NETWORK` | Network (`test` or `main`)  | `test`                         |
| `ROOCH_NODE_URL`| Custom Rooch RPC URL        | Auto-detected from network     |
| `PORT`          | Server port                 | `3004`                         |
| `DEBUG`         | Enable debug logging        | `true`                         |

### CLI Options

```bash
# Server URL
--url http://localhost:3004

# Enable debug mode
--debug

# CADOP domain for key authorization
--cadop https://test-id.nuwa.dev
```

## 📊 Example Usage

- `pnpm dev:client info` – show service info (public)
- `pnpm dev:client whoami` – authenticate and return DID/key_id

## 🔗 Related Documentation

- [Identity Kit Documentation](../../packages/identity-kit/README.md)
- [DIDAuth Design](../../packages/identity-kit/docs/design-and-development.md)

## 📄 License

This example is part of the Nuwa project.
