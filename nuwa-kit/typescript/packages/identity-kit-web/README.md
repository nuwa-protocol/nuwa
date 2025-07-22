# @nuwa-ai/identity-kit-web

Web extensions for Nuwa Identity Kit, providing browser-friendly implementations and utilities.

## Features

- **Popup Blocker Handling** - Automatically detects and handles popup blockers with multiple fallback strategies
- **Multiple KeyStore implementations**:
  - `LocalStorageKeyStore` - Uses browser's localStorage for key storage
  - `IndexedDBKeyStore` - Uses IndexedDB for key storage, supports CryptoKey objects
- **DeepLinkManager** - Manages deep link authentication flow with CSRF protection
- **IdentityKitWeb** - High-level API for web applications
- **React hooks** - `useIdentityKit` and `useIdentityKitWithFallbacks` hooks for React applications
- **Session Key Scopes** - Support for custom permission scopes in authentication flow

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

// Basic connect (backward compatible - returns void)
await nuwa.connect();

// OR: Connect with popup blocker handling (returns detailed result)
const result = await nuwa.connect({
  scopes: ['0xdefi::swap::*'],
  fallbackMethod: 'copy', // Options: 'redirect' | 'copy' | 'manual'
  returnResult: true // Enable detailed result
});

if (result) { // Only when returnResult=true
  switch (result.action) {
    case 'popup':
      console.log('Popup opened successfully');
      break;
    case 'copy':
      console.log('URL copied to clipboard');
      break;
    case 'redirect':
      console.log('Page will redirect');
      break;
    case 'manual':
      console.log('Manual handling required:', result.url);
      break;
  }
}

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

  const handleConnect = async () => {
    // Option 1: Backward compatible (no detailed result)
    await connect();
    
    // Option 2: With detailed result for popup handling
    const result = await connectWithResult({
      fallbackMethod: 'copy'
    });
    
    if (result.action === 'copy' && result.success) {
      alert('Authorization link copied to clipboard!');
    } else if (result.action === 'manual') {
      alert(`Please open this link: ${result.url}`);
    }
  };

  if (state.isConnecting) {
    return <div>Connecting...</div>;
  }

  if (!state.isConnected) {
    return <button onClick={handleConnect}>Connect</button>;
  }

  return (
    <div>
      <p>Connected as: {state.agentDid}</p>
      <button onClick={logout}>Logout</button>
    </div>
  );
}
```

### Enhanced React Hook (Recommended)

```tsx
import { useIdentityKitWithFallbacks } from '@nuwa-ai/identity-kit-web';

function MyComponent() {
  const { state, connectWithFallbacks, logout } = useIdentityKitWithFallbacks();

  const handleConnect = async () => {
    await connectWithFallbacks({
      scopes: ['0xdefi::swap::*'],
      onPopupBlocked: () => alert('Popup blocked by browser'),
      onUrlCopied: () => alert('Link copied! Paste in new tab'),
      onManualUrl: (url) => alert(`Please click: ${url}`)
    });
  };

  if (state.isConnected) {
    return (
      <div>
        <p>Connected: {state.agentDid}</p>
        <button onClick={logout}>Logout</button>
      </div>
    );
  }

  return (
    <button onClick={handleConnect} disabled={state.isConnecting}>
      {state.isConnecting ? 'Connecting...' : 'Connect Wallet'}
    </button>
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