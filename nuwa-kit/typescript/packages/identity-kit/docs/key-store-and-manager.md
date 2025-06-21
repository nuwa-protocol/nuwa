# KeyStore & KeyManager – Core Design (Nuwa Identity Kit)

> Version: Draft – 2025-06-20

本文件归档 **Nuwa Identity Kit 核心包（`@nuwa-ai/identity-kit`）** 中与密钥管理相关的设计，包括：

1. KeyStore 接口与默认实现
2. KeyStoreSigner 统一签名适配器
3. KeyManager 生命周期封装
4. KeyProtectionStrategy（可选密钥保护策略）

---

## 1. KeyStore

> 接口定义位于 `@nuwa-ai/identity-kit`，不同运行环境（browser / node / rn …）可提供各自实现。

```ts
import type { KeyType } from '@nuwa-ai/identity-kit';

export interface StoredKey {
  keyId: string;           // 完整 verificationMethod ID
  agentDid: string;        // 所属 DID
  keyType: KeyType;        // 曲线/算法
  publicKey: string;       // base58btc（或 multibase）
  privateKey?: string;
}

export interface KeyStore {
  listKeyIds(): Promise<string[]>;            // ← 新增：列举全部 keyId
  load(keyId?: string): Promise<StoredKey | null>;
  save(key: StoredKey): Promise<void>;
  clear(keyId?: string): Promise<void>;
  /**
   * 可选：直接用指定 keyId 为 data 签名。用于 NonExtractableStrategy / WebAuthn。
   * 默认实现可抛 `NotImplemented`。
   */
  sign?(keyId: string, data: Uint8Array): Promise<Uint8Array>;
}
```

### 1.1 默认实现（位于 `identity-kit-web` 扩展包）

* `BrowserLocalStorageKeyStore` – `PlaintextStrategy` / `PassphraseStrategy`
* `IndexedDBKeyStore` – 支持 `CryptoKey` 持久化与 `sign()`
* `MemoryKeyStore` – 测试 / SSR 环境，内存 Map，天然支持 `listKeyIds()`

---

## 2. KeyStoreSigner（统一签名适配器）

```ts
import { KeyStore, SignerInterface } from '@nuwa-ai/identity-kit';

export class KeyStoreSigner implements SignerInterface {
  constructor(private ks: KeyStore) {}

  async listKeyIds() {
    /* 读取 KeyStore 支持的 key 列表 */
  }

  async signWithKeyId(data: Uint8Array, keyId: string): Promise<Uint8Array> {
    // 1) 若 keystore 自带 sign()（适配 WebAuthn / CryptoKey），优先调用
    if (typeof this.ks.sign === 'function') {
      return this.ks.sign(keyId, data);
    }
    // 2) 否则读取 privateKey / keyHandleId → 走 CryptoUtils.sign()
  }

  /* canSignWithKeyId / getDid / getKeyInfo 同理 */
}
```

特性：

* 任意实现了 `KeyStore` 的存储皆可无缝插入；不区分 Browser/Node 签名器。
* 针对 `NonExtractableStrategy` / WebAuthn：KeyStore 覆写 `sign()` 即可。
* 现有 `LocalSigner` 计划迁移为 `MemoryKeyStore + KeyStoreSigner` 组合（保留若干版本兼容）。

---

## 3. KeyManager（密钥生命周期封装）

> **v0 MVP** 已在核心包中发布，提供最小可用功能：生成 / 导入 / 查询 / 签名。

```ts
export interface KeyManagerOptions {
  store?: KeyStore;            // 默认 BrowserLocalStorageKeyStore
  defaultKeyType?: KeyType;    // 默认 Ed25519
}

export class KeyManager implements SignerInterface {
  constructor(opts?: KeyManagerOptions);

  /* 生命周期 */
  generateKey(fragment?: string, keyType?: KeyType): Promise<StoredKey>;
  importKey(stored: StoredKey): Promise<void>;
  deleteKey(keyId: string): Promise<void>;

  /* 查询 */
  listKeyIds(): Promise<string[]>;
  getStoredKey(keyId: string): Promise<StoredKey | null>;

  /* 签名（SignerInterface） */
  signWithKeyId(data: Uint8Array, keyId: string): Promise<Uint8Array>;
  canSignWithKeyId(id: string): Promise<boolean>;
  getDid(): string;
  getKeyInfo(keyId: string): Promise<{ type: KeyType; publicKey: Uint8Array } | undefined>;
}
```

实现要点：

1. 内部持有单一 `KeyStore`（可替换）。
2. `signWithKeyId` 逻辑与 **KeyStoreSigner** 相同；因此上层（如 WebSDK）统一依赖 **KeyManager**，不再直接实例化 KeyStoreSigner。
3. 可无破坏地扩展：rotateKey、ensureKey、事件流、组合多 KeyStore 等。

---

## 4. KeyProtectionStrategy（可选安全增强）

当业务需要更高安全等级时，可通过注入不同策略在 **不改变 API** 的前提下切换密钥保护方式。

```ts
export interface KeyProtectionStrategy {
  protect(key: Uint8Array): Promise<ProtectedBlob>;
  unprotect(blob: ProtectedBlob): Promise<Uint8Array>; // 若需用户输入可抛异常
}

// 默认明文
class PlaintextStrategy implements KeyProtectionStrategy { /* ... */ }
// 会话级 Passphrase
class PassphraseStrategy implements KeyProtectionStrategy { /* ... */ }
// 不可导出 CryptoKey
class NonExtractableStrategy implements KeyProtectionStrategy { /* ... */ }

class BrowserLocalStorageKeyStore implements KeyStore {
  constructor(private protect: KeyProtectionStrategy = new PlaintextStrategy()) {}
  /* ... */
}
```

* **开发 / Demo**：`PlaintextStrategy`
* **通用生产**：`PassphraseStrategy` + 会话缓存 + 自动锁定
* **高敏感**：`NonExtractableStrategy` 或 WebAuthn

---

## 5. 参考实现

浏览器侧扩展包 `@nuwa-ai/identity-kit-web` 提供：

* `BrowserLocalStorageKeyStore`
* `IndexedDBKeyStore`
* `KeyStoreSigner`（默认注入）
* `MemoryKeyStore`（测试/SSR）

Node/RN 环境可实现自定义 `KeyStore`，只需遵循上述接口。

---

> 本文档仅描述 **核心包** 的设计。如需了解与浏览器集成相关的 DeepLink、WebSDK 等，请参考 `identity-kit-web` 文档。 