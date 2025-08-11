# Payment Kit Integration Example

This example demonstrates how to integrate the Payment Kit into HTTP servers and clients, providing a complete payment-enabled API ecosystem.

## 🎯 What This Example Shows

- **Server Side**: HTTP server with payment-enabled endpoints using `ExpressPaymentKit`
- **Client Side**: CLI client that makes payment-enabled HTTP requests using `PaymentChannelHttpClient`
- **Different Pricing Models**: Fixed pricing, per-character pricing, and per-token pricing
- **Payment Channel Management**: Automatic channel creation, management, and payment verification

## 📁 Project Structure

```
payment-kit-integration/
├── src/
│   ├── server.ts           # HTTP server with payment integration
│   └── client-cli.ts       # CLI client for making payment requests
├── package.json
├── tsconfig.json
├── env.example             # Environment configuration template
└── README.md
```

## 🚀 Quick Start

### 1. Prerequisites

Make sure you have:
- Node.js 18+ installed
- A running Rooch network (local or testnet)
- IdentityKit configured with private keys

### 2. Setup

```bash
# Navigate to the example directory
cd nuwa-kit/typescript/examples/payment-kit-integration

# Install dependencies
pnpm install

# Copy and configure environment variables
cp env.example .env
# Edit .env with your actual private keys and configuration
```

### 3. Generate Identity Keys

If you don't have private keys yet:

```bash
# Generate custodian and service keys
npx @nuwa-ai/identity-kit generate

# Copy the generated keys to your .env file
```

### 4. Start the Server

```bash
# Development mode (with hot reload)
pnpm dev:server

# Or build and run
pnpm build
pnpm start:server
```

The server will start on `http://localhost:3000` and show:
- 🔑 Identity Kit initialization
- 💳 Payment Kit setup
- 📋 Available endpoints

### 5. Use the CLI Client

In another terminal:

```bash
# Interactive mode (recommended for first-time users)
pnpm dev:client

# Or specific commands
pnpm dev:client info                    # Get service information
pnpm dev:client echo "Hello World"      # Send echo request
pnpm dev:client process "hello world"   # Process text
pnpm dev:client chat "What is AI?"      # Chat completion
pnpm dev:client channel                 # Show channel info
```

## 📡 API Endpoints

### Public Endpoints (No Payment Required)

- `GET /payment/info` - Service information and configuration
- `GET /payment/price?assetId=<id>` - Asset price information  
- `GET /health` - Health check

### Payment-Enabled Endpoints

- `GET /echo?message=<text>` - Echo service (0.002 USD fixed)
- `POST /process` - Text processing (0.0005 USD per request)
- `POST /chat/completions` - AI chat completion (0.00005 USD per token, post-billing)

### Management Endpoints

- `GET /admin/health` - Admin health check (no auth required)
- `GET /admin/claims` - View pending claims (admin only)
- `POST /admin/claim/<channelId>` - Trigger manual claim (admin only)
- `GET /payment/recovery` - Recover client state (DID auth required)
- `POST /payment/commit` - Submit signed SubRAV (DID auth required)

## 💰 Payment Flow

1. **First Request**: Client sends handshake SubRAV (nonce=0, amount=0)
2. **Service Response**: Server calculates cost and returns unsigned SubRAV proposal
3. **Subsequent Requests**: Client signs and sends the proposed SubRAV
4. **Auto-claiming**: Server periodically claims accumulated amounts

## 🔧 Configuration

### Environment Variables

| Variable | Description | Default |
|----------|-------------|---------|
| `CUSTODIAN_PRIVATE_KEY` | Client identity private key | Required |
| `SERVICE_PRIVATE_KEY` | Server identity private key | Required |
| `ROOCH_NETWORK` | Rooch network | `local` |
| `ROOCH_NODE_URL` | Rooch RPC endpoint | `http://localhost:50051` |
| `PORT` | Server port | `3000` |
| `SERVICE_ID` | Service identifier | `payment-example` |
| `DEFAULT_ASSET_ID` | Payment asset | `0x3::gas_coin::RGas` |
| `DEBUG` | Enable debug logging | `true` |

### CLI Options

```bash
# Server URL
--url http://localhost:3000

# Enable debug mode
--debug

# Set maximum payment per request
--max-amount 10000000

# Interactive mode
--interactive
```

## 📊 Example Usage

### 1. Service Information
```bash
$ pnpm dev:client info

🔍 Fetching service info...
📋 Service Information:
  Service ID: payment-example
  Service DID: did:rooch:1a2b3c...
  Network: local
  Default Asset: 0x3::gas_coin::RGas
  Default Price: 1000000000 picoUSD
```

Note: Service info is accessed via `/payment/info` endpoint provided by ExpressPaymentKit.

### 2. Echo Request
```bash
$ pnpm dev:client echo "Hello, Payment Kit!"

🔊 Calling echo endpoint...
✅ Echo Response:
  Echo: Hello, Payment Kit!
  Cost: 2000000 (2.000000 RGas)
  Nonce: 1
  Timestamp: 2024-01-15T10:30:00.000Z
```

### 3. Text Processing
```bash
$ pnpm dev:client process "hello world"

⚙️ Calling text processing endpoint...
✅ Processing Response:
  Input: hello world
  Output: HELLO WORLD
  Characters: 11
  Cost: 1100000 (1.100000 RGas)
  Nonce: 2
```

### 4. Chat Completion (Post-billing)
```bash
$ pnpm dev:client chat "What is blockchain?"

🤖 Calling chat completion endpoint...
✅ Chat Completion Response:
  Response: This is a mock AI response to: "What is blockchain?..."
  Tokens Used: 75 (prompt: 25, completion: 50)
  Cost: 3750000 (3.750000 RGas) - calculated after response based on actual token usage
  Nonce: 3
```

## 🔍 Monitoring and Debugging

### Server Logs
The server provides detailed logging for:
- Payment verification
- Billing calculations
- Channel state changes
- Error conditions

### Client State
Check current payment channel state:
```bash
$ pnpm dev:client channel

📊 Channel Information:
  Channel ID: 0x1234...
  Pending Nonce: 4
  Accumulated Amount: 8850000
```

### Admin Interface
Monitor claims and channel health:
```bash
curl http://localhost:3000/admin/claims \
  -H "Authorization: DID-JWT eyJ..."
```

## 🛠️ Development

### Building
```bash
pnpm build
```

### Testing Different Scenarios
1. **First-time user**: Start with a fresh identity
2. **Existing user**: Use an identity with existing channels
3. **Insufficient funds**: Test payment failures
4. **Network issues**: Test reconnection and recovery

### Extending the Example
- Add new API endpoints with different pricing models
- Implement rate limiting
- Add request/response validation
- Integrate with real AI services

## 📚 Key Concepts

### ExpressPaymentKit (Server)
- Automatic billing middleware integration
- Multiple pricing strategies:
  - **Pre-billing**: Fixed price strategies (PerRequest) - calculated before request execution
  - **Post-billing**: Usage-based strategies (PerToken) - calculated after request execution using actual usage data
- Built-in admin and recovery endpoints
- DID-based authentication

### PaymentChannelHttpClient (Client)
- Automatic payment channel management
- Transparent HTTP request wrapper
- Built-in retry and error handling
- State persistence and recovery

### Payment Flow
1. **Channel Discovery**: Client discovers service DID and pricing
2. **Channel Creation**: First request creates payment channel
3. **Payment Loop**: Subsequent requests use deferred payment model
4. **Auto-claiming**: Server claims when thresholds are met

## 🔗 Related Documentation

- [Payment Kit Documentation](../../packages/payment-kit/README.md)
- [Identity Kit Documentation](../../packages/identity-kit/README.md)
- [Rooch Network Documentation](https://rooch.network)

## 🐛 Troubleshooting

### Common Issues

1. **"Private key not found"**
   - Ensure `.env` file exists and contains valid keys
   - Run `npx @nuwa-ai/identity-kit generate` to create keys

2. **"Failed to connect to Rooch network"**
   - Check `ROOCH_NODE_URL` in `.env`
   - Ensure Rooch network is running

3. **"Payment required (402)"**
   - Client may need more funds in payment hub
   - Check payment channel balance

4. **"SubRAV conflict (409)"**
   - Clear client state: delete local storage
   - Restart client application

### Getting Help

- Check the [troubleshooting guide](../../packages/payment-kit/docs/troubleshooting.md)
- Review server logs for detailed error messages
- Use `--debug` flag for verbose client logging

## 📄 License

This example is part of the Nuwa project and is licensed under the same terms.