# HTTP Payment Kit E2E Tests

This directory contains end-to-end tests for the HTTP Payment Kit, testing the complete payment workflow including:

- Real blockchain integration with Rooch nodes
- HTTP billing middleware with deferred payment model
- Payment channel operations (open, authorize, claim, close)
- Auto-claim functionality based on thresholds
- Multi-request payment sequences

## Prerequisites

1. **Node.js** ≥ 18 (for built-in fetch support)
2. **Rooch Node** running locally or accessible remotely
3. **Environment Variables** configured

## Running E2E Tests

### Local Development

1. **Start a local Rooch node** (if testing locally):

   ```bash
   # Follow Rooch documentation to start a local node
   # Default port: 6767
   ```

2. **Run E2E tests**:

   ```bash
   # Basic E2E test run
   npm run test:e2e:local

   # With debug output
   npm run test:e2e:debug

   # Against a custom node
   ROOCH_NODE_URL=http://your-node:6767 PAYMENT_E2E=1 npm run test:e2e
   ```

### CI/CD Environment

```bash
# Set environment variables
export ROOCH_NODE_URL=https://test-seed.rooch.network:443
export PAYMENT_E2E=1

# Run tests
npm run test:e2e
```

## Environment Variables

| Variable         | Description          | Default                 | Required |
| ---------------- | -------------------- | ----------------------- | -------- |
| `PAYMENT_E2E`    | Enable E2E tests     | -                       | ✅ Yes   |
| `ROOCH_NODE_URL` | Rooch node endpoint  | `http://localhost:6767` | No       |
| `DEBUG_E2E`      | Enable debug logging | -                       | No       |

## Test Structure

### Test Files

- `HttpPaymentKit.e2e.test.ts` - Main E2E test suite
- `server/index.ts` - Billing server implementation
- `jest.env.ts` - Jest setup configuration
- `jest.env.ts` - Environment setup

### Test Scenarios

1. **Complete HTTP deferred payment flow**
   - First request (no payment, receives SubRAV proposal)
   - Subsequent requests (pays for previous, receives new proposal)
   - Multiple requests to trigger auto-claim

2. **Mixed request types with different pricing**
   - Echo requests (cheaper: 0.001 RGas)
   - Process requests (expensive: 0.01 RGas)
   - Pricing consistency validation

3. **Auto-claim threshold behavior**
   - Amount-based auto-claim (0.5 RGas threshold)
   - Nonce-based auto-claim (5 requests threshold)
   - Blockchain state verification

4. **Error handling**
   - Invalid payment data
   - Server health checks
   - Admin endpoint access

5. **Channel state consistency**
   - Client vs blockchain state comparison
   - State synchronization
   - Channel lifecycle management

## Deferred Payment Model

The tests validate the deferred payment model implemented in `HttpBillingMiddleware`:

1. **Client makes request** → Server responds with business data + unsigned SubRAV proposal
2. **Client signs SubRAV** from previous response and includes it in next request
3. **Server verifies payment** for previous request and processes current request
4. **Auto-claim triggers** when thresholds are met (amount or nonce count)

This model provides:

- ✅ Reduced round-trips (better UX)
- ✅ Non-blocking initial responses
- ✅ Secure payment verification
- ✅ Automatic settlement

## Test Configuration

### Jest Configuration (`jest.config.e2e.ts`)

- **Timeout**: 2 minutes per test (blockchain operations are slow)
- **Workers**: 1 (serial execution to avoid state conflicts)
- **Environment**: Node.js with global fetch support

### Server Configuration

- **Port**: 3001 (to avoid conflicts)
- **Auto-claim threshold**: 0.5 RGas
- **Auto-claim nonce threshold**: 5 requests
- **Service ID**: `e2e-test-service`

## Troubleshooting

### Common Issues

1. **Tests skip/timeout**:
   - Ensure `PAYMENT_E2E=1` is set
   - Verify Rooch node is running and accessible
   - Check network connectivity

2. **Payment channel errors**:
   - Ensure test accounts have sufficient balance
   - Check if previous test runs left channels in inconsistent state
   - Verify DID creation and key management

3. **Server startup failures**:
   - Check if port 3001 is available
   - Verify all dependencies are installed
   - Review server logs for specific errors

### Debug Mode

Enable debug logging:

```bash
DEBUG_E2E=1 npm run test:e2e:local
```

This provides detailed logs for:

- Blockchain operations
- Payment channel state changes
- HTTP request/response cycles
- Auto-claim triggers

## Performance Considerations

- E2E tests take 2-5 minutes to complete (blockchain operations)
- Tests run serially to prevent state conflicts
- Each test creates fresh payment channels
- Auto-cleanup runs after all tests complete

## Security Validation

The tests verify security aspects:

- ✅ SubRAV signature validation
- ✅ Channel authorization checks
- ✅ Payment verification before service delivery
- ✅ Protection against tampered payments
- ✅ Nonce progression validation

## Contributing

When adding new E2E tests:

1. Follow the existing test structure
2. Use descriptive test names
3. Include proper cleanup in `afterAll`
4. Test both success and failure scenarios
5. Validate blockchain state consistency
6. Add appropriate logging for debugging
