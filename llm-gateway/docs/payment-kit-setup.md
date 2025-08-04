# Payment-Kit Integration Setup Guide

> This document describes how to set up and use the Payment-Kit integration in LLM Gateway.

## Overview

The LLM Gateway now supports optional integration with `@nuwa-ai/payment-kit` for decentralized billing and DID authentication. This integration provides:

- **Unified DID Authentication**: Built-in DID authentication using ExpressPaymentKit
- **Per-Token Billing**: Automatic billing based on OpenRouter usage data
- **Payment Channels**: Support for NIP-4 unidirectional payment channels
- **Graceful Fallback**: Seamless fallback to traditional DID auth when payment-kit is disabled

## Configuration

### Environment Variables

Copy `env.example` to `.env` and configure the following variables:

```bash
# Enable/disable payment-kit integration
ENABLE_PAYMENT_KIT=false

# DID authentication only (without billing)
DID_AUTH_ONLY=true

# Service private key for payment-kit (required when ENABLE_PAYMENT_KIT=true)
LLM_GATEWAY_SERVICE_KEY=your_service_private_key_hex

# Rooch Network Configuration
ROOCH_NODE_URL=http://localhost:6767
ROOCH_NETWORK=local

# Payment Configuration
DEFAULT_ASSET_ID=0x3::gas_coin::RGas
DEFAULT_PRICE_PICO_USD=1000000000

# Admin API Configuration
ADMIN_API_KEY=your_admin_api_key

# Debug Configuration
DEBUG=billing:*,payment:*
```

### Installation

1. **Install dependencies**:
   ```bash
   cd llm-gateway
   npm install
   ```

2. **Build the project**:
   ```bash
   npm run build
   ```

## Usage Modes

### Mode 1: Traditional DID Auth (Default)

```bash
ENABLE_PAYMENT_KIT=false
DID_AUTH_ONLY=true
```

- Uses existing `didAuthMiddleware`
- No billing functionality
- Compatible with existing clients

### Mode 2: DID Auth with Payment-Kit (Transition)

```bash
ENABLE_PAYMENT_KIT=true
DID_AUTH_ONLY=false
PAYMENT_STRICT_MODE=false
```

- Uses ExpressPaymentKit for DID authentication
- Payment verification enabled but non-blocking
- Logs payment errors as warnings

### Mode 3: Full Payment Enforcement

```bash
ENABLE_PAYMENT_KIT=true
DID_AUTH_ONLY=false
PAYMENT_STRICT_MODE=true
```

- Full payment enforcement
- Requests without valid payment will be rejected with HTTP 402

## Billing Rules

The system uses programmatic billing rules based on OpenRouter usage data:

- **`/chat/completions`**: 15 picoUSD per token
- **`/completions`**: 15 picoUSD per token  
- **`/upload`**: 500 picoUSD per request
- **Other routes**: Free

## API Endpoints

### Admin Endpoints

All admin endpoints require `X-Admin-Key` header:

```bash
curl -H "X-Admin-Key: your_admin_api_key" \
     http://localhost:3000/api/v1/admin/health
```

#### GET `/api/v1/admin/health`
Health check endpoint (no auth required)

#### GET `/api/v1/admin/billing/status`
Get billing system status

#### GET `/api/v1/admin/billing/stats`
Get billing statistics

#### GET `/api/v1/admin/billing/channels`
List payment channels

#### POST `/api/v1/admin/billing/cleanup`
Clean up expired proposals

#### GET `/api/v1/admin/config`
Get current configuration

## Local Development

### Start with Payment-Kit Disabled (Recommended)

```bash
# Copy example env
cp env.example .env

# Edit .env to set:
ENABLE_PAYMENT_KIT=false
DID_AUTH_ONLY=true

# Start development server
npm run dev
```

### Start with Payment-Kit Enabled

```bash
# Generate a service private key
node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"

# Edit .env to set:
ENABLE_PAYMENT_KIT=true
LLM_GATEWAY_SERVICE_KEY=<generated_private_key>
ROOCH_NODE_URL=http://localhost:6767

# Start Rooch local node (in another terminal)
# See Rooch documentation for setup

# Start development server with debug
DEBUG=billing:*,payment:* npm run dev
```

## Integration with Existing Clients

### No Changes Required for DID Auth

Existing clients using DID authentication will continue to work without changes when `ENABLE_PAYMENT_KIT=false`.

### Payment Channel Integration

To use payment channels, clients need to:

1. Send `X-Payment-Channel-Data` header with signed SubRAV
2. Include usage data in request body for billing calculation

Example:
```javascript
const response = await fetch('/api/v1/chat/completions', {
  method: 'POST',
  headers: {
    'Authorization': 'DIDAuthV1 <signed_auth_header>',
    'X-Payment-Channel-Data': '<signed_subrav>',
    'Content-Type': 'application/json'
  },
  body: JSON.stringify({
    model: 'gpt-3.5-turbo',
    messages: [...],
    usage: { include: true }
  })
});
```

## Migration Strategy

### Phase 1: Parallel Testing
- Deploy with `ENABLE_PAYMENT_KIT=false`
- Test admin endpoints and configuration
- Verify existing functionality is unaffected

### Phase 2: Gradual Rollout
- Enable payment-kit with `PAYMENT_STRICT_MODE=false`
- Monitor logs for payment verification issues
- Gradually increase payment enforcement

### Phase 3: Full Enforcement
- Enable `PAYMENT_STRICT_MODE=true`
- All requests require valid payment
- Remove fallback DID auth middleware

## Troubleshooting

### Common Issues

1. **Payment-Kit fails to initialize**
   - Check `LLM_GATEWAY_SERVICE_KEY` is set
   - Verify Rooch node is accessible at `ROOCH_NODE_URL`
   - Check network connectivity

2. **DID authentication fails**
   - Verify VDR registry is properly initialized
   - Check client's DID signature format
   - Ensure proper authorization header format

3. **Billing calculations incorrect**
   - Verify OpenRouter returns usage data
   - Check billing rules configuration
   - Monitor usage data extraction logs

### Debug Logging

Enable debug logging:
```bash
DEBUG=billing:*,payment:*,didauth:* npm run dev
```

### Health Checks

Check system status:
```bash
# Basic health
curl http://localhost:3000/api/v1/admin/health

# Billing status (requires admin key)
curl -H "X-Admin-Key: your_admin_key" \
     http://localhost:3000/api/v1/admin/billing/status
```

## Security Considerations

1. **Private Key Management**: Store `LLM_GATEWAY_SERVICE_KEY` securely
2. **Admin API Key**: Use strong `ADMIN_API_KEY` in production
3. **Network Security**: Secure Rooch node communication
4. **Payment Verification**: Monitor for payment fraud attempts

## Production Deployment

1. **Environment Setup**:
   - Use production Rooch network
   - Set strong admin API keys
   - Configure proper logging

2. **Monitoring**:
   - Monitor payment channel status
   - Track billing accuracy
   - Set up alerts for failures

3. **Backup Strategy**:
   - Backup payment channel data
   - Store private keys securely
   - Plan for disaster recovery 