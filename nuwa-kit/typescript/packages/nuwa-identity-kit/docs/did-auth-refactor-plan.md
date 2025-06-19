# DIDAuth 重构方案（草案）

> 版本：v0.1 ‑ 2025-06-19

本文档总结了针对 Nuwa Identity Kit 的一次重要架构调整，旨在提升 **客户端集成体验**、**服务端验签通用性** 以及 **后续协议演进的可扩展性**。

---

## 1. 目标与动机

1. **解耦签名逻辑**：当前 `createNIP1Signature / verifyNIP1Signature` 深藏于 `NuwaIdentityKit`，导致只想做「签名/验签」也要依赖完整 Kit，过于臃肿。
2. **统一多协议版本**：随着 NIP-2 可能演进，新版本（V2、V3…）需要并存。采用 `DIDAuth` 顶层命名空间，按版本子模块划分，可平滑升级。
3. **简化密钥管理**：`NuwaIdentityKit` 内部的 `operationalPrivateKeys` Map 造成私钥双重存储、接口混乱。移除它，所有签名一律通过 `SignerInterface` 实现。

---

## 2. 模块划分

```
nuwa-identity-kit
└─ src/
   ├─ DIDAuth/
   │  ├─ index.ts            // 导出各版本
   │  └─ v1/                 // DIDAuthV1（实现 NIP-2）
   │     ├─ signer.ts        // 通用签名入口
   │     ├─ verifier.ts      // 服务端验签
   │     └─ utils.ts         // canonicalize, header 处理等
   └─ NuwaIdentityKit.ts     // 依旧提供 DID 管理能力
```

### 2.1 DIDAuth 顶层
* `DIDAuth.createAuthHeader(version, payload, signer, didDoc, options?)`
* `DIDAuth.verifyAuthHeader(version, header, vdrRegistry, options?)`
* 目前仅实现 `version = 'v1'`（对标 NIP-2），未来可追加 v2、v3…

### 2.2 DIDAuthV1 API（草案）
```ts
// 生成签名对象
createSignature(
  payload: Record<string, any>,
  signer: SignerInterface,
  didDocument: DIDDocument,
  keyId: string,
  opts?: {
    nonce?: string;
    timestamp?: number;
  }
): NIP1SignedObject;

// 转 Authorization 头
toAuthorizationHeader(sigObj: NIP1SignedObject): string; // "DIDAuthV1 <base64url>"

// 解析 & 验签
verifySignature(
  sigObj: NIP1SignedObject,
  resolverOrDidDoc: DIDResolver | DIDDocument,
  opts?: {
    maxClockSkew?: number; // 默认 300s
  }
): Promise<boolean>;

// 直接对 HTTP Header 验签
verifyAuthHeader(header: string, resolver: DIDResolver): Promise<{ ok: boolean; error?: string }>;
```

---

## 3. NuwaIdentityKit 调整

1. **删除**：
   ```ts
   private operationalPrivateKeys: Map<string, CryptoKey | Uint8Array> = new Map();
   ```
2. **签名相关方法**：
   * `createNIP1Signature` → `deprecated`（vNext 删除），内部只是一层转调到 `DIDAuthV1.createSignature`，并利用 `this.signer`。
   * `verifyNIP1Signature` → 保持静态兼容，但代码迁移到 `DIDAuthV1` 并从此处 re-export。
3. **Signer 责任**：全部私钥读取、签名由实现 `SignerInterface` 的调用方提供（示例：`KeyStoreSigner`、`HardwareWalletSigner`、`PasskeySigner`）。Kit 不再保存私钥引用。

---

## 4. 客户端集成示例

```ts
import { DIDAuth, KEY_TYPE, type DIDDocument } from '@nuwa-ai/identity-kit';
import { KeyStoreSigner } from './KeyStoreSigner';

const signer = new KeyStoreSigner();
const did = signer.getDid();
const didDoc: DIDDocument = cache.get(did) ?? await resolve(did);

const payload = {
  operation: 'login',
  params: { domain: location.hostname },
};

const sigObj = DIDAuth.v1.createSignature(payload, signer, didDoc, signer.getDefaultKeyId());
const authHeader = DIDAuth.v1.toAuthorizationHeader(sigObj);
fetch('/api/secure', { headers: { Authorization: authHeader } });
```

---

## 5. 服务端验签示例

```ts
import { DIDAuth } from '@nuwa-ai/identity-kit';

const header = req.headers['authorization'];
const { ok, error } = await DIDAuth.v1.verifyAuthHeader(header, vdrRegistry);
if (!ok) return res.status(401).json({ error });
```

---

## 6. 迁移计划

| 阶段 | 任务 | 说明 |
|------|------|------|
| **0.0** | 制定文档 | 当前阶段 |
| **0.1** | 实现 `DIDAuth` 目录及 v1 API | 复制现有逻辑，拆分封装；保持旧方法可用（发 Deprecation Warning） |
| **0.2** | `NuwaIdentityKit` 移除 `operationalPrivateKeys` | 彻底依赖 `SignerInterface` |
| **0.3** | 更新示例、文档、LoginButton 等调用方 | 确认编译通过，端到端测试 |
| **1.0** | 发布 Major 版本 | 清理 deprecated API |

---

## 7. 向后兼容性说明

* 在 0.x 期间，旧的 `createNIP1Signature / verifyNIP1Signature` 保留，但内部调用新实现并打印 Deprecation 日志。
* `operationalPrivateKeys` 将标记为废弃，读取时返回 `undefined`，写入将抛出警告。

---

## 8. 待解决问题

1. **Nonce 存储接口**：服务端如何持久化已用 nonce？提供可插拔策略？
2. **跨 Tab 私钥共享**：浏览器多标签场景下，`KeyStoreSigner` 的同步问题。
3. **多链/多 VDR 策略**：`DIDAuth.verifySignature` 需要统一接口支持多方法解析、缓存刷新策略。 

---

## 9. Nonce 存储（Replay Protection）

### 9.1 抽象接口
```ts
export interface NonceStore {
  /**
   * 尝试记录 nonce。
   * @param ttlSeconds nonce 的有效期（秒）。实现层需据此计算过期时间并存储。
   * @returns true 表示记录成功（说明之前未出现过），false 表示重复（应拒绝请求）
   */
  tryStoreNonce(
    signerDid: string,
    domainSeparator: string,
    nonce: string,
    ttlSeconds: number
  ): Promise<boolean>;

  /**
   * 清理过期 nonce（可选，具体实现自行决定调度机制）。
   */
  sweep?(): Promise<void>;
}
```

### 9.2 默认实现：`InMemoryNonceStore`
* 使用 `Map<string /* composite key */, number /* expiresAt */>`。
* `sweep()` 定期清理过期项（可通过 `setInterval` 简易调度）。
* 适用于单实例服务或开发环境。

```ts
const store = new InMemoryNonceStore({ capacity: 100_000, sweepIntervalMs: 60_000 });
```

### 9.3 注入方式
* `DIDAuth.v1.verifyAuthHeader(header, vdrRegistry, opts?: { nonceStore?: NonceStore })`
  * 若未传 `nonceStore`，默认使用单例 `InMemoryNonceStore`。
* 业务可替换为 Redis、DynamoDB 等分布式实现。

---

## 10. DID Document 缓存

从 v0.2 起，DID 文档缓存责任 **完全下沉到 VDR 层 / Resolver 层**。`DIDAuth` 不再维护自己的 LRU 缓存。

### 10.1 设计原则
1. **单一缓存来源**：各 `VDRInterface` 实现或 `VDRRegistry` 统一决定缓存策略（内存、Redis、区块高度感知等）。
2. **Resolver 注入**：`DIDAuth` 通过 `DIDResolver` 接口请求 `resolveDID`，对缓存实现保持透明。

### 10.2 默认行为
* `VDRRegistry.getInstance()` 内部可提供简易内存 LRU（例如 5 分钟 TTL）；
* 部署者可在各链特定 VDR 中定制更精细的缓存逻辑。

### 10.3 扩展方案
若需要跨进程缓存，可在自定义 `DIDResolver` 中封装 Redis/Memcached 读取逻辑，然后传给 `verifyAuthHeader()`。
