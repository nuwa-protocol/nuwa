# Identity-Kit Web – Design Document

> Draft ‑ 2025-06-20

## 1. Motivation

Login-demo 暴露的痛点：

1. 开发者需复制样板代码，自己实现 `SimpleSigner`、`KeyStore`、DeepLink 构建 / 回调解析逻辑。
2. 如需升级 Deep-Link 协议或 SDK 版本，需要逐一修改各应用，维护成本高。

因此：

* **核心包 (`@nuwa-ai/identity-kit`)** 保持协议纯净；
* **Web 扩展包 (`identity-kit-web`)** 提供浏览器友好的默认实现，开箱即用，同时保持可替换。

---

## 2. 分层结构

```
@nuwa-ai/identity-kit              ← 核心（无环境依赖）
└─ identity-kit-web                ← 浏览器扩展
   ├─ keystore/                    ← 多种实现
   │   ├─ LocalStorageKeyStore.ts
   │   ├─ IndexedDBKeyStore.ts
   ├─ deeplink/
   │   └─ DeepLinkManager.ts
   ├─ react/                       ← *可选* React Hooks
   │   └─ useIdentityKit.ts
   ├─ index.ts                     ← 出口
   └─ docs/                        ← 当前文件
```

> 任何涉及 `window`, `localStorage`, `fetch` 等浏览器 API 的代码只存在于 *identity-kit-web*，核心包不受影响。

---

## 3. 统一接口

> ⚠️ **关于 KeyStore / KeyStoreSigner / KeyManager 的完整设计已迁移至核心包文档**：
> [KeyStore & KeyManager – Core Design](../../nuwa-identity-kit/docs/key-store-and-manager.md)。

### 3.1 DeepLinkManager

```ts
export interface ConnectOptions {
  cadopDomain?: string;
  keyType?: string;          // 默认 Ed25519VerificationKey2020
  idFragment?: string;
  relationships?: string[];  // 默认 ['authentication']
  redirectPath?: string;     // 默认 '/callback'
}

export interface AuthResult {
  success: boolean;
  agentDid?: string;
  keyId?: string;
  error?: string;
}

class DeepLinkManager {
  buildAddKeyUrl(opts?: ConnectOptions): Promise<{ url: string; state: string; privateKey: Uint8Array; publicKey: Uint8Array; }>;
  handleCallback(search: string): Promise<AuthResult>;
}
```
* `buildAddKeyUrl` 负责：生成 KeyPair、state、拼 URL；并把 key 暂存在 `sessionStorage`。
* `handleCallback` 负责：解析 queryString，校验 `state`，将 key 迁移入 KeyStore。

### 3.4 WebSDK 高阶封装

```ts
export class IdentityKitWeb {
  static async init(opts?: {
    cadopDomain?: string;
    storage?: 'local' | 'indexeddb' | KeyStore;
  }): Promise<IdentityKitWeb>;

  connect(): Promise<void>;        // 触发 deep-link
  sign(payload: any): Promise<NIP1SignedObject>;
  verify(sig: NIP1SignedObject): Promise<boolean>;
  logout(): Promise<void>;
}
```

React 开发者可使用：
```ts
const { state, connect, sign, verify } = useIdentityKit();
```

## 4. 安全考虑

1. **私钥保护**：默认 KeyStore 明文存储，仅供演示。生产需传入自定义加密 KeyStore。
2. **State 校验**：DeepLinkManager 在回调时验证 `state` 防 CSRF。
3. **Timestamp / Nonce**：DIDAuth 已自带；SDK 助攻开发者正确使用。

### 4.1 可选 KeyStore 加密方案（留作后续增强）

> 当上层业务需要更高安全等级时，可在不改变 API 的前提下切换 KeyStore 保护策略。SDK 仅提供接口与参考实现，不强制应用立即启用。

| 方案 | 交互频次 | 说明 |
|------|---------|------|
| **会话级解锁 (PassphraseStrategy)** | 首次进入或显式 `unlock()` 时一次性输入，之后同一 Tab 内透明签名 | 私钥经 PBKDF2/Argon2 推导出的对称密钥加密；解密后的 key 仅缓存在内存，`beforeunload`/超时自动 `lock()` |
| **非可导出 CryptoKey (NonExtractableStrategy)** | 0 次（浏览器自动） | 使用 WebCrypto 生成 `extractable:false` 的 `CryptoKey`；对象序列化进 IndexedDB；取出后可直接签名而无法导出原始字节；兼容性取决于浏览器对 Ed25519 的支持 |
| **WebAuthn / 硬件密钥** | 0~1 次（取决于 `userVerification` 设置） | 把密钥存至 Secure Enclave/TPM；每次 `navigator.credentials.get()` 可能需要生物特征；适合极高安全场景 |

---

## 5. 版本与发布策略

* `identity-kit-web` 与核心包同主版本；
* DeepLink 协议向后兼容的小改动 → minor bump；破坏性变更 → major。

---

## 6. 迁移步骤（以 login-demo 为例）

1. `npm i @nuwa-ai/identity-kit-web`。
2. 删除本地 `KeyStore.ts`, `SimpleSigner.ts`, `DeepLink.ts`。
3. 初始化：
   ```ts
   import { IdentityKitWeb } from '@nuwa-ai/identity-kit-web';
   const nuwa = await IdentityKitWeb.init();
   ```
4. 调 `nuwa.connect()` 取代 `generateKeyAndBuildUrl` + window.open。
5. 回调页：
   ```ts
   await nuwa.handleCallback(location.search);
   ```
6. 签名 / 验证：
   ```ts
   const sig = await nuwa.sign(payload);
   const ok  = await nuwa.verify(sig);
   ```

---

## 7. 里程碑

| 阶段 | 目标 |
|------|------|
| M1   | 抽取 login-demo 逻辑 → KeyStore + KeyStoreSigner + DeepLinkManager |
| M2   | 发布 `identity-kit-web@0.1.0-beta`，demo 迁移 |
| M3   | React Hook + IndexedDBKeyStore + 文档完善 |
| M4   | 稳定版 1.0 | 