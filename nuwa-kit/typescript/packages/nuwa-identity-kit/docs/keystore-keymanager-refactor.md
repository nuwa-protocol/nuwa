# KeyStore / KeyManager / KeyStoreSigner 重构提案

> 版本：Draft · 2025-06-21

本文档基于近期集成实践中暴露的问题，总结现有设计的不足，并给出一份 **更简洁、一致** 的重构方案，涉及核心文件：`KeyStore.ts`、`KeyManager.ts`、`KeyStoreSigner.ts`。

---

## 1 现状与痛点

| 痛点 | 描述 |
|------|------|
| DID 多处重复存储 | `StoredKey.agentDid` / `KeyStoreSigner.agentDid` / `KeyManager.agentDid` 可能出现不一致，需要异步 *guess*。|
| 构造函数里启动异步 | `KeyManager` 为推断 DID 在 constructor 里启动异步任务，破坏同步语义。|
| KeyStore 与 DID 绑定 | 存储层维护 `agentDid` 字段，破坏单一职责。|
| KeyStoreSigner 角色混乱 | 既保存 DID 又做签名，界限不清。|

---

## 2 设计目标

1. **Single Source of Truth**：DID 只在 `KeyManager` 内部维护。
2. **同步 API**：所有同步方法保持同步，不在构造函数里隐式执行异步。
3. **职责分离**：
   * `KeyStore` ‑ 仅存取密钥原始材料。
   * `KeyStoreSigner` ‑ 仅做"用某个 keyId 产生签名"。
   * `KeyManager` ‑ 负责 DID / Key 生命周期。
4. **keyId 自包含**：从 `keyId` 即可解析 DID，不再在 `StoredKey` 存 `agentDid` 字段。

---

## 3 核心数据结构

### 3.1 StoredKey
```ts
export interface StoredKey {
  /** 完整 verificationMethod ID，如 did:rooch:0x123#key-1 */
  keyId: string;
  keyType: KeyType;
  publicKeyMultibase: string;
  privateKeyMultibase?: string;
  meta?: Record<string, unknown>; // 可扩展
}
```

### 3.2 KeyManager（提取要点）
```ts
class KeyManager implements SignerInterface {
  private did?: string;

  constructor(private store: KeyStore = new MemoryKeyStore()) {}

  setDid(did: string) { this.did = did; }

  async importKey(key: StoredKey) {
    const didFromKey = key.keyId.split('#')[0];
    this.did ??= didFromKey;
    if (this.did !== didFromKey) throw new Error('Cross-DID key');
    await this.store.save(key);
  }

  async generateKey(fragment = `key-${Date.now()}`, type = 'Ed25519VerificationKey2020') {
    if (!this.did) throw new Error('setDid() before generateKey()');
    /* 生成密钥 → this.store.save() */
  }

  async getDid(): Promise<string> {
    if (this.did) return this.did;
    const ids = await this.store.listKeyIds();
    if (!ids[0]) throw new Error('No key / DID found');
    this.did = ids[0].split('#')[0];
    return this.did;
  }
}
```

### 3.3 KeyStoreSigner（纯签名适配器）
```ts
class KeyStoreSigner implements SignerInterface {
  constructor(private ks: KeyStore) {}

  async signWithKeyId(data: Uint8Array, id: string) {
    if (typeof this.ks.sign === 'function') return this.ks.sign(id, data);
    const key = await this.ks.load(id);
    /* 解码 privateKeyMultibase → CryptoUtils.sign() */
  }
}
```

---

## 4 兼容性与迁移

1. **删除 `StoredKey.agentDid` 字段**：
   * 影响：序列化格式变化，需一次性迁移存量数据或同时支持旧字段读取。
2. `KeyManager` 调用方需先 `setDid()` 或先 `importKey()` 再 `generateKey()`。
3. 所有取 DID 的地方统一改为 `keyId.split('#')[0]`，或调用 `KeyManager.getDid()`。
4. `DeepLinkManager` 等生成 URL 时无需显式传 DID，直接由 `keyId` 推断。
5. 逐步淘汰 `KeyStoreSigner.getDid()` / `setDid()` API。

---

## 5 渐进实施步骤

1. **在新分支** 实现上述接口变更，保证单测通过。  
2. 更新 `identity-kit-web`、`login-demo` 等调用方。  
3. 提供脚本将 LocalStorage 中旧格式数据转换为新格式（可选）。  
4. 发布 minor 版本并在 CHANGELOG 中注明 breaking change。  
5. 观察生产环境一周，确认无回滚需求后删除旧兼容代码。  

---

## 6 总结

通过将 DID 的唯一事实源收敛到 **KeyManager**，并让 `keyId` 自包含 DID，可：

* 消除多处状态同步与推断逻辑；
* 提升 API 可预测性；
* 精简 KeyStore / Signer 的职责；
* 为后续多 Keystore、硬件签名器等扩展打下更稳固的基础。 