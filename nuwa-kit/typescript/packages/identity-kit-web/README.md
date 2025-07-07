# @nuwa-ai/identity-kit-web

Web extensions for Nuwa Identity Kit, providing browser-friendly implementations and utilities.

## Features

- Multiple KeyStore implementations:
  - `LocalStorageKeyStore` - Uses browser's localStorage for key storage
  - `IndexedDBKeyStore` - Uses IndexedDB for key storage, supports CryptoKey objects
- `DeepLinkManager` - Manages deep link authentication flow
- `IdentityKitWeb` - High-level API for web applications
- React hooks (optional) - `useIdentityKit` hook for React applications
- **Popup-safe connection methods** - Avoid browser popup blocking with `buildConnectUrl` and `openConnectUrl`

## Browser Popup Blocking

Modern browsers may block popups that are opened after asynchronous operations. The original `connect()` method performs an async operation before calling `window.open()`, which can cause the popup to be blocked.

To avoid this issue, use the new popup-safe methods:

- `buildConnectUrl()` - Pre-builds the connection URL (can be called ahead of time)
- `openConnectUrl(url)` - Opens the URL immediately (call in direct response to user action)

This ensures the popup opens in direct response to the user action without any async operations in between.

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

// Connect to Cadop (original method)
await nuwa.connect();

// Alternative: Popup-safe connection (recommended)
const connectUrl = await nuwa.buildConnectUrl();
// Later, in a user action handler:
nuwa.openConnectUrl(connectUrl);

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
  const { state, connect, buildConnectUrl, openConnectUrl, sign, verify, logout } = useIdentityKit();

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

#### Popup-Safe Connection (Recommended)

To avoid browser popup blocking, use the new `buildConnectUrl` and `openConnectUrl` methods:

```tsx
import { useIdentityKit } from '@nuwa-ai/identity-kit-web';

function PopupSafeConnectButton() {
  const { state, buildConnectUrl, openConnectUrl } = useIdentityKit();
  const [connectUrl, setConnectUrl] = useState(null);

  // Pre-build the connect URL
  useEffect(() => {
    if (!state.isConnected && !connectUrl) {
      buildConnectUrl().then(setConnectUrl).catch(console.error);
    }
  }, [state.isConnected, connectUrl, buildConnectUrl]);

  // Handle click - no async operations, popup won't be blocked
  const handleConnect = () => {
    if (connectUrl) {
      openConnectUrl(connectUrl);
      setConnectUrl(null); // Clear for next use
    }
  };

  if (state.isConnected) return null;

  return (
    <button onClick={handleConnect} disabled={state.isConnecting || !connectUrl}>
      {state.isConnecting ? 'Connecting…' : 'Sign-in with DID'}
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