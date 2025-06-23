# @nuwa-ai/identity-kit

|[English](./README.md)|中文|

> Nuwa Protocol Identity SDK for TypeScript

`@nuwa-ai/identity-kit` 是 Nuwa 协议在 TypeScript/JavaScript 环境下的核心 DID SDK。它遵循 [NIP-1](https://github.com/nuwa-protocol/NIPs/blob/main/nips/nip-1.md)（单一 DID / 多密钥模型），并为 [NIP-2](https://github.com/nuwa-protocol/NIPs/blob/main/nips/nip-2.md) 认证协议提供底层支持。

## ✨ 功能特性

* **简易启动**: 一行 `IdentityKit.bootstrap()` 即可完成 KeyStore、VDR 等环境装配。
* **NIP-1 兼容**: 完整覆盖主密钥、操作密钥、服务声明等 DID Document 元素及生命周期管理。
* **可插拔架构**: 通过 VDR 插件机制支持 `did:key`、`did:rooch` 等多种 DID 方法，也可自定义扩展。
* **浏览器友好**: 内置 `LocalStorage`、`IndexedDB` KeyStore；同时兼容 Node.js / Deno 等运行时。
* **类型安全**: 全 TypeScript 实现，导出完善的类型定义。

## 📦 安装

```bash
npm install @nuwa-ai/identity-kit @roochnetwork/rooch-sdk
```

---

## 🚀 快速上手

下面示例展示了「准备环境 ➜ 加载/创建 DID ➜ 基本操作」的完整流程。

```ts
import { IdentityKit, KeyType } from '@nuwa-ai/identity-kit';
import { RoochClient } from '@roochnetwork/rooch-sdk';

// Step 1) 启动运行环境（注册 VDR、创建 KeyManager & KeyStore）
const env = await IdentityKit.bootstrap({
  method: 'rooch',
  vdrOptions: {
    rpcUrl: 'https://test-seed.rooch.network/',
  },
});

//Step 2-A) 已有 DID ➜ 直接加载
const kit = await env.loadDid('did:rooch:0xYourDid', /* 可选自定义 signer */);
```

---

## ⚙️ 常用操作

```ts
// 读取 DID Document
const doc = kit.getDIDDocument();

// 添加一个新设备密钥
await kit.addVerificationMethod(
  { keyType: KeyType.ECDSA_SECP256K1 },
  ['authentication'],
);

// 使用 DIDAuth v1 (NIP-2) 对数据进行签名
import { DIDAuth } from '@nuwa-ai/identity-kit';

const sig = await DIDAuth.v1.createSignature(
  { operation: 'example', params: { message: 'hello' } },
  env.keyManager,                  // SignerInterface 实例（此处复用 env 内置的 KeyManager）
  doc.verificationMethod![0].id    // keyId to sign with
);
```


---

## 🛠️ 核心概念速查

| 概念 | 说明 |
|---|---|
| `IdentityEnv` | 由 `IdentityKit.bootstrap()` 或 `IdentityEnvBuilder` 构建的运行环境，持有全局 `VDRRegistry` 与 `KeyManager`。 |
| `VDRRegistry` | 全局单例，管理各 DID Method 的 VDR 实例，并提供统一的 DID 解析 / 创建接口。 |
| `KeyManager` | SDK 内置的密钥生命周期管理器，实现 `SignerInterface`，可直接用于签名。 |
| `KeyStore` | 密钥持久化后端。浏览器默认使用 `LocalStorageKeyStore` / `IndexedDBKeyStore`。 |
| `IdentityKit` | 绑定到 **单个 DID** 的高阶对象，暴露 DID 操作（增删 Key、Service、签名、解析等）。 |

---

## 🔬 高级用法

### `IdentityEnvBuilder` 链式配置

```ts
import { IdentityEnvBuilder } from '@nuwa-ai/identity-kit';

const env = await new IdentityEnvBuilder()
  .useVDR('rooch', { rpcUrl: 'https://...' })
  .useKeyStore(new IndexedDBKeyStore())
  .init();
```

### 自定义 VDR / KeyStore

实现 `VDRInterface` / `KeyStore` 接口并在 `builder.useVDR()`、`builder.useKeyStore()` 中注入，即可接入新的 DID 方法或存储后端。

---

## 📄 License

Apache-2.0
