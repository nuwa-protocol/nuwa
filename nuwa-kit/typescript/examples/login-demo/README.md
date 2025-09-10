# Nuwa Agent Login Demo

This is a demo application showcasing third-party login integration with Nuwa Agent DID using deep-links.

## Features

- Generate cryptographic keys in the browser
- Authorize keys with Nuwa Agent DID using deep-links
- Sign challenges using authorized keys
- Persistent key storage in browser localStorage
- Gateway & MCP debug panel with unified transaction history

## Prerequisites

- Node.js 18+
- npm 9+

## User Flow

### First-time Connection

1. User visits the demo application
2. User clicks "Connect with Nuwa Agent"
3. Application generates a new key pair
4. Application opens a deep-link to CADOP Web with the public key
5. User authorizes the key in CADOP Web
6. CADOP Web redirects back to the callback URL
7. Application stores the key with the Agent DID

### Subsequent Logins

1. User visits the demo application
2. Application detects stored key and shows connected status
3. User clicks "Login with Nuwa Agent"
4. Application signs a challenge using the stored key
5. Application displays the signature

## Running Locally

```bash
# Install dependencies
npm install

# Start development server
npm run dev

# Build for production
npm run build

# Preview production build
npm run preview
```

## Tech Stack

- React
- TypeScript
- Vite
- @nuwa-ai/identity-kit

## Integration Steps

To integrate "Login with Nuwa Agent" in your own application:

1. Generate a key pair in the browser
2. Create a deep-link to CADOP Web with the public key
3. Handle the callback from CADOP Web
4. Store the key and Agent DID
5. Use the key for signing operations

For more details, see the [Integration Guide](https://github.com/rooch-network/nuwa/tree/main/nuwa-services/cadop-service/typescript/docs/third_party_login_integration.md).

## License

This project is licensed under the MIT License.
