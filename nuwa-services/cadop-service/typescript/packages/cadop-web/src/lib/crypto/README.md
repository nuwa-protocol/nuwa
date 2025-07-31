# Key Generation Utils

This module provides utilities for generating cryptographic key pairs and managing them in the CADOP service.

## Usage

### Generating a Key Pair

```typescript
import { generateKeyPair } from './keyGeneration';
import { KeyType } from '@nuwa-ai/identity-kit';

// Generate an Ed25519 key pair
const keyInfo = await generateKeyPair(
  'did:example:123',
  KeyType.ED25519,
  'service-key'
);

console.log('Service Key:', keyInfo.storedKeyString);
console.log('Public Key:', keyInfo.publicKeyMultibase);
```

### Server Integration

After generating a key, add the `storedKeyString` to your server environment:

```bash
# .env
SERVICE_KEY="z5TcCLDFjRskS6zyQXGYGPw..."
```

Then in your server code:

```typescript
import { IdentityKit } from '@nuwa-ai/identity-kit';

const env = await IdentityKit.bootstrap(...);
await env.keyManager.importKeyFromString(process.env.SERVICE_KEY!);
```

## Security Notes

- Private keys are generated in the browser memory and should be copied immediately
- Never store private keys in browser storage or transmit them over the network
- Always use HTTPS when deploying the CADOP interface
- Store the Service Key securely in server environment variables