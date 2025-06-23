# Integrating **@nuwa-ai/identity-kit-web** with Login-Demo

> Status: Draft · 2025-06-20

This document records how the *Nuwa Agent Login Demo* consumes the yet-to-be-published **identity-kit-web** package **from the local monorepo**, and how the UI migrates to the new high-level APIs (`IdentityKitWeb` & `useIdentityKit`).

---

## 1  Local Dependency Setup

Because `identity-kit-web` has not been released to npm you must link it via **file path** .

```jsonc
// packages/login-demo/package.json (excerpt)
{
  "dependencies": {
    "@nuwa-ai/identity-kit": "file:../../../../../../nuwa-kit/typescript/packages/nuwa-identity-kit",
    "@nuwa-ai/identity-kit-web": "file:../../../../../../nuwa-kit/typescript/packages/identity-kit-web"
  }
}
```

1. Run `npm install` (or `pnpm install`). Vite will resolve the path automatically.
2. When the package is published you can replace the file spec with the semver tag, e.g. `^1.0.0`.

---

## 2  Using the React Hook (recommended)

The easiest way to integrate is to rely on the hook exported by the web-SDK.

```tsx
import { useIdentityKit } from '@nuwa-ai/identity-kit-web';

export function App() {
  const { state, connect, sign, verify, logout } = useIdentityKit({
    appName: 'Nuwa Login Demo',        // optional – readable key fragment
    cadopDomain: localStorage.getItem('cadop-domain') ?? 'https://test-id.nuwa.dev',
    storage: 'indexeddb',              // or 'local'
  });

  /* render UI according to state */
}
```

### Hook advantages

* Handles SDK initialisation & persistent connection state.
* Provides imperative helpers (`connect`, `sign`, `verify`, `logout`).
* Eliminates bespoke `KeyStore`, `SimpleSigner` and Deep-Link helpers.

---

## 3  File-by-file Migration

| Legacy file | Action | Notes |
|-------------|--------|-------|
| `src/services/DeepLink.ts` | **Delete** | replaced by `IdentityKitWeb.connect()` / `.handleCallback()` |
| `src/services/KeyStore.ts` | **Delete** | browser storage now handled by SDK KeyStore implementations |
| `src/services/SimpleSigner.ts` | **Delete** | signing handled via SDK / DIDAuth |
| `src/components/ConnectButton.tsx` | simplify to call `connect()` |
| `src/components/SignButton.tsx` | call `sign()` instead of local signer |
| `src/components/VerifyButton.tsx` | call `verify()` |
| `pages/Callback.tsx` | ~10→3 lines – just invoke `sdk.handleCallback()` |

### Simplified Callback Page

```tsx
import { useEffect } from 'react';
import { IdentityKitWeb } from '@nuwa-ai/identity-kit-web';

export function Callback() {
  useEffect(() => {
    (async () => {
      const sdk = await IdentityKitWeb.init();
      await sdk.handleCallback(location.search);
      window.close();
    })();
  }, []);
  return <p>Processing …</p>;
}
```

---

## 4  Gateway Debug Panel Update

Replace manual signer usage with hook helpers:

```ts
const sigObj = await sign(payload);
const authHeader = DIDAuth.v1.toAuthorizationHeader(sigObj);
```

No other changes are required.

---

## 5  FAQ

**Q : What if I still need custom encryption for KeyStore?**  
A : Pass a custom `KeyManager` with your KeyStore implementation into `IdentityKitWeb.init({ keyManager })`.

**Q : Will the deep-link URL format change?**  
A : The SDK generates the same `/add-key?payload=…` route as the original helper, so existing CADOP Web routes keep working.

---

Maintainer: @nuwa-team 