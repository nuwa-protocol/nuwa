# @nuwa-ai/identity-kit-web

Web extensions for Nuwa Identity Kit, providing browser-friendly implementations and utilities.

## Features

- Multiple KeyStore implementations:
  - `LocalStorageKeyStore` - Uses browser's localStorage for key storage
  - `IndexedDBKeyStore` - Uses IndexedDB for key storage, supports CryptoKey objects
- `DeepLinkManager` - Manages deep link authentication flow
- `IdentityKitWeb` - High-level API for web applications
- React hooks (optional) - `useIdentityKit` hook for React applications

## Installation

```bash
npm install @nuwa-ai/identity-kit-web
```

## Usage

### Basic Usage

```typescript
import { IdentityKitWeb } from '@nuwa-ai/identity-kit-web';

// Initialize the SDK
const nuwa = await IdentityKitWeb.init();

// Connect to Cadop
await nuwa.connect();

// Handle callback (in your callback page)
await nuwa.handleCallback(location.search);

// Sign a payload
const sig = await nuwa.sign({ hello: 'world' });

// Verify a signature
const isValid = await nuwa.verify(sig);

// Logout
await nuwa.logout();
```

### React Hook

```tsx
import { useIdentityKit } from '@nuwa-ai/identity-kit-web';

function MyComponent() {
  const { state, connect, sign, verify, logout } = useIdentityKit();

  if (state.isConnecting) {
    return <div>Connecting...</div>;
  }

  if (!state.isConnected) {
    return <button onClick={connect}>Connect</button>;
  }

  return (
    <div>
      <p>Connected as: {state.agentDid}</p>
      <button onClick={logout}>Logout</button>
    </div>
  );
}
```

### Advanced Usage

```typescript
import { 
  IdentityKitWeb, 
  IndexedDBKeyStore, 
  KeyManager 
} from '@nuwa-ai/identity-kit-web';

// Custom KeyStore with protection strategy
const store = new IndexedDBKeyStore();

// Custom KeyManager
const keyManager = new KeyManager({ store });

// Initialize SDK with custom components
const nuwa = await IdentityKitWeb.init({
  cadopDomain: 'https://my-cadop-instance.com',
  keyManager
});
```

## License

MIT 