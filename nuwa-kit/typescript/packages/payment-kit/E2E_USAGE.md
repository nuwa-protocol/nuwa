# HTTP Payment Kit E2E Tests - Quick Start

## Prerequisites

1. **Rooch Node** running on `localhost:6767` (or set `ROOCH_NODE_URL`)
2. **Dependencies** installed: `npm install`
3. **Environment** variables configured

## Quick Start

### 1. Verify Setup
```bash
npm run test:e2e:verify
```

### 2. Run E2E Tests
```bash
# Local development
npm run test:e2e:local

# With debug output  
npm run test:e2e:debug

# Against custom node
ROOCH_NODE_URL=https://your-node.com PAYMENT_E2E=1 npm run test:e2e
```

## What Gets Tested

✅ **Complete HTTP Payment Flow**
- Deferred payment model (first request free, pay for previous)
- Multi-request sequences with SubRAV progression
- Auto-claim based on amount/nonce thresholds

✅ **Real Blockchain Integration**
- Payment channel operations (open, authorize, claim, close)
- DID-based authentication and signing
- State consistency between client and blockchain

✅ **HTTP Billing Middleware**
- Express middleware integration
- Different pricing for different endpoints
- Admin endpoints for monitoring and management

## Test Scenarios

| Test | Description | Duration |
|------|-------------|----------|
| `Complete HTTP deferred payment flow` | First request → SubRAV proposal → Payment for previous | ~1-2 min |
| `Mixed request types with different pricing` | Echo (0.001 RGas) vs Process (0.01 RGas) | ~30 sec |
| `Auto-claim threshold behavior` | Triggers claim at 0.5 RGas or 5 requests | ~1-2 min |
| `Error handling` | Health checks, admin endpoints | ~15 sec |
| `Channel state consistency` | Client vs blockchain state validation | ~30 sec |

## Expected Output

```
🚀 Starting HTTP Payment Kit E2E Tests
✅ Test setup completed:
   Payer DID: did:rooch:...
   Payee DID: did:rooch:...
   Test Asset: 0x3::gas_coin::RGas
   Node URL: http://localhost:6767

💰 Setting up payment channel...
✅ Hub funded: 1000000000 units (tx: 0x...)
✅ Channel opened: 0x... (tx: 0x...)
✅ Channel verified as active
✅ Billing server started on http://localhost:3001

🔄 Testing complete HTTP deferred payment flow
📞 Request 1: First call (no payment required)
✅ First request successful, received SubRAV proposal (nonce: 1)
📞 Request 2: Second call (pays for first request)  
✅ Second request successful, payment processed (nonce: 2)
📞 Requests 3-6: Multiple calls to trigger auto-claim
✅ Request 3 successful (nonce: 3)
...
🎉 Complete HTTP deferred payment flow successful!

...all tests pass...

✅ Billing server shutdown
✅ Payment channel closed
🏁 HTTP Payment Kit E2E Tests completed
```

## Troubleshooting

### Common Issues

**Tests skip with "PAYMENT_E2E not set"**
```bash
# Solution: Set the environment variable
export PAYMENT_E2E=1
```

**Connection errors**
```bash
# Check if Rooch node is running
curl http://localhost:6767/
```

**Setup verification fails**
```bash
# Run verification to diagnose
npm run test:e2e:verify
```

**Port conflicts**
```bash
# Kill processes using port 3001
lsof -ti:3001 | xargs kill -9
```

### Debug Mode

Enable detailed logging:
```bash
DEBUG_E2E=1 npm run test:e2e:local
```

This shows:
- Blockchain transaction details
- HTTP request/response cycles  
- Payment verification steps
- Auto-claim triggers

## Architecture

```
Client Request → HTTP Middleware → Business Logic
     ↓              ↓                    ↓
   Sign SubRAV → Verify Payment → Return Data + New SubRAV
     ↓              ↓                    ↓
 Next Request → Process Previous → Continue...
```

The **deferred payment model** allows for:
- ✅ Non-blocking user experience
- ✅ Reduced network round-trips  
- ✅ Secure payment verification
- ✅ Automatic settlement optimization 