# @nuwa-ai/identity-kit

|English|[中文](./README.zh-CN.md) |

> Nuwa Protocol Identity SDK for TypeScript

`@nuwa-ai/identity-kit` is the core DID SDK of the Nuwa protocol for TypeScript / JavaScript runtimes. It complies with [NIP-1](https://github.com/nuwa-protocol/NIPs/blob/main/nips/nip-1.md) (single DID / multi-key model) and provides the underlying capabilities required by [NIP-2](https://github.com/nuwa-protocol/NIPs/blob/main/nips/nip-2.md) authentication.

## ✨ Features

* **Easy bootstrap** – A single `IdentityKit.bootstrap()` call bootstraps the KeyStore, VDR, and other building blocks.
* **NIP-1 compliant** – Full coverage of DID Document lifecycle: master key, operational keys, service declarations, etc.
* **Pluggable architecture** – VDR plugins for `did:key`, `did:rooch`, and custom methods.
* **Browser friendly** – Built-in `LocalStorage` / `IndexedDB` KeyStores while still compatible with Node.js / Deno.
* **Type-safe** – 100 % TypeScript with rich type definitions.

## 📦 Installation

```bash
npm install @nuwa-ai/identity-kit @roochnetwork/rooch-sdk
```

---

## 🚀 Quick Start

The snippet below demonstrates the full flow: **prepare environment ➜ load / create DID ➜ basic operations**.

```ts
import { IdentityKit, KeyType } from '@nuwa-ai/identity-kit';
import { RoochClient } from '@roochnetwork/rooch-sdk';

// Step 1) Bootstrap runtime (register VDR, create KeyManager & KeyStore)
const env = await IdentityKit.bootstrap({
  method: 'rooch',
  vdrOptions: {
    rpcUrl: 'https://test-seed.rooch.network/',
  },
});

// Step 2-A) Existing DID → load
const kit = await env.loadDid('did:rooch:0xYourDid');
```

---

## ⚙️ Common Operations

```ts
// Read DID Document
const doc = kit.getDIDDocument();

// Add a new device key
await kit.addVerificationMethod(
  { keyType: KeyType.ECDSA_SECP256K1 },
  ['authentication'],
);

// Sign data using DIDAuth v1 (NIP-2)
import { DIDAuth } from '@nuwa-ai/identity-kit';

const sig = await DIDAuth.v1.createSignature(
  { operation: 'example', params: { message: 'hello' } },
  env.keyManager,                  // SignerInterface (reuse env KeyManager)
  doc.verificationMethod![0].id    // keyId
);
```

---

## 🛠️ Quick Reference

| Concept | Description |
|---------|-------------|
| `IdentityEnv` | Runtime built by `IdentityKit.bootstrap()` / `IdentityEnvBuilder`, holding the global `VDRRegistry` & `KeyManager`. |
| `VDRRegistry` | Singleton managing VDR instances and providing unified DID resolve / create APIs. |
| `KeyManager` | Built-in key lifecycle manager implementing `SignerInterface`; can sign directly. |
| `KeyStore` | Key persistence backend. Browsers use `LocalStorageKeyStore` / `IndexedDBKeyStore` by default. |
| `IdentityKit` | High-level object bound to **one DID**, exposing key / service / signing / resolving APIs. |

---

## 🔬 Advanced Usage

### Chainable `IdentityEnvBuilder`

```ts
import { IdentityEnvBuilder } from '@nuwa-ai/identity-kit';

const env = await new IdentityEnvBuilder()
  .useVDR('rooch', { rpcUrl: 'https://...' })
  .useKeyStore(new IndexedDBKeyStore())
  .init();
```

### Custom VDR / KeyStore

Implement `VDRInterface` / `KeyStore` and inject via `builder.useVDR()` / `builder.useKeyStore()` to support new DID methods or storage back-ends.

---

## 📄 License

Apache-2.0 