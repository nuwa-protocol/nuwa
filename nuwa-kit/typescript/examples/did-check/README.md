# did-check example (Rooch mainnet)

This example shows a minimal did-check service using `@nuwa-ai/identity-kit` for DID authentication. It targets deployments like `did-check.nuwa.dev`, providing only public health/info plus a single protected `/whoami`. Defaults are set to **Rooch mainnet** and CADOP domain `id.nuwa.dev`.

## 🎯 What This Example Shows

- **Server Side**: Express server with DID authentication middleware
- **Protected Routes**: Example of DID-authenticated endpoints
- **CADOP Integration**: Deep-link flow for key authorization

## 📁 Project Structure

```
did-check/
├── src/
│   └── server.ts           # Express server with DID auth middleware
├── package.json
├── tsconfig.json
├── env.example
├── Dockerfile
├── railway.json
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

| Variable        | Description                                          | Default                        |
| --------------- | ---------------------------------------------------- | ------------------------------ |
| `ROOCH_NETWORK` | Network (`test` or `main`)                           | `main`                         |
| `ROOCH_NODE_URL`| Custom Rooch RPC URL                                 | Auto-detected from network     |
| `PORT`          | Server port                                          | `3004`                         |
| `DEBUG`         | Enable detailed error/debug logs (local dev only*)  | `false`                        |

## 🔗 Related Documentation

- [Identity Kit Documentation](../../packages/identity-kit/README.md)
- [DIDAuth Design](../../packages/identity-kit/docs/design-and-development.md)

## 📄 License

This example is part of the Nuwa project.
