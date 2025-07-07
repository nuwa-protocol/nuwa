# Popup-Safe Connection Examples

This directory contains examples demonstrating how to use the new popup-safe connection methods in the Nuwa Identity Kit Web SDK.

## The Problem

Modern browsers may block popups that are opened after asynchronous operations. The original `connect()` method performs an async operation before calling `window.open()`, which can cause the popup to be blocked.

## The Solution

Use the new popup-safe methods:

- `buildConnectUrl()` - Pre-builds the connection URL (can be called ahead of time)
- `openConnectUrl(url)` - Opens the URL immediately (call in direct response to user action)

## Files

### `popup-safe-usage.tsx`

Contains comprehensive React examples showing:

1. **Basic popup-safe connection button** - The recommended pattern for most use cases
2. **Advanced usage with retry and error handling** - Shows error handling and retry functionality
3. **Direct SDK usage** - How to use the methods with plain JavaScript
4. **Migration example** - How to migrate from the legacy connect method
5. **Custom hook** - A reusable hook for managing connect URL state

### `../demo.html`

An interactive HTML demo that shows the difference between the legacy and new approaches.

## Usage Patterns

### Pattern 1: Pre-build URL on Mount

```tsx
function ConnectButton() {
  const { buildConnectUrl, openConnectUrl } = useIdentityKit();
  const [connectUrl, setConnectUrl] = useState(null);

  useEffect(() => {
    buildConnectUrl().then(setConnectUrl);
  }, [buildConnectUrl]);

  const handleConnect = () => {
    if (connectUrl) {
      openConnectUrl(connectUrl);
    }
  };

  return <button onClick={handleConnect}>Connect</button>;
}
```

### Pattern 2: Build URL on Demand

```tsx
function ConnectButton() {
  const { buildConnectUrl, openConnectUrl } = useIdentityKit();
  const [connectUrl, setConnectUrl] = useState(null);

  const prepareAndConnect = async () => {
    if (!connectUrl) {
      const url = await buildConnectUrl();
      setConnectUrl(url);
    }
    openConnectUrl(connectUrl);
  };

  return <button onClick={prepareAndConnect}>Connect</button>;
}
```

### Pattern 3: Direct SDK Usage

```javascript
// Initialize and prepare
const sdk = await IdentityKitWeb.init();
const connectUrl = await sdk.buildConnectUrl();

// Later, in user action handler
document.getElementById('connect-btn').addEventListener('click', () => {
  sdk.openConnectUrl(connectUrl);
});
```

## Key Benefits

1. **No popup blocking** - `window.open()` is called immediately in response to user action
2. **Better user experience** - Users aren't surprised by blocked popups
3. **Backward compatible** - Existing code continues to work
4. **Flexible** - Multiple usage patterns to fit different needs

## Migration Guide

To migrate from the legacy approach:

1. Replace `await connect()` with pre-built URLs
2. Call `buildConnectUrl()` ahead of time (e.g., in useEffect)
3. Call `openConnectUrl()` directly in click handlers
4. Handle loading states appropriately

The legacy `connect()` method is still available for backward compatibility.