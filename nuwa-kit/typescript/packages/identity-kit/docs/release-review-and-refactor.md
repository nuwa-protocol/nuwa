# Nuwa Identity Kit – v1 发布前 Review & 重构建议

> 作者：AI code assistant  
> 日期：2025-06-21

---

## 总览
本文档基于当前 `@nuwa-ai/identity-kit` 以及其配套示例仓库（`identity-kit-web` / `cadop-web` / `llm-gateway` / `login-demo`）的代码与文档，站在即将发布 **正式版 (v1)** 的视角，对 SDK 的公开接口、易用性、冗余性及潜在改进点进行最后一次全面审查，并给出重构建议。

每一小节均按照以下格式展开：

1. **评估角度**：说明本节关注的点。
2. **发现的问题**：总结观察到的不足或风险。
3. **改进建议**：给出具体的调整方向，若涉及破坏性修改，会明确指出。

---

## 1. 对外类型 & 方法命名合理性

### 评估角度
* 命名是否直观、符合 TypeScript/JavaScript 社区习惯。  
* 同一概念在不同文件/模块内是否保持一致。  
* 是否存在歧义或过于冗长的名称。

### 发现的问题
1. **重复/歧义命名**  
   * `NuwaIdentityKit` 与文件目录中的 `IdentityKitWeb`、`CadopIdentityKit` 等并列，初学者容易混淆 *核心* 与 *扩展*。  
   * `KEY_TYPE`（常量）与 `KeyType`（类型）同时存在，偶有大小写错配风险。  
   * `DIDAuth.v1.createSignature()` 与 `NuwaIdentityKit.createNIP1Signature()` 命名不一致，同为 NIP-1 签名函数。  

2. **过长或带实现细节的名称**  
   * `Ed25519VerificationKey2020`、`EcdsaSecp256k1VerificationKey2019` 直接暴露在业务代码中，开发者需记忆长串字符串。  
   * `RoochVDR` 的 **Options** 类型 `RoochVDROperationOptions` 包含链上交易细节（`maxGas`、`waitForConfirmation` 等），混杂在 DID 操作主流程，初学者容易误用。  

### 改进建议
1. **统一核心命名空间**  
   * 重命名 `NuwaIdentityKit` 为 `IdentityKitCore` 或简写 `IdentityKit`，将浏览器侧包装保持为 `IdentityKitWeb`，Custodian 扩展保持 `CadopIdentityKit`。  
2. **常量枚举化**  
   * 提供 `enum KeySuite`（或 `VerificationKeySuite`），将长字符串映射为可读枚举，导出给开发者使用，内部再映射到具体字符串。  
3. **签名 API 一致化**  
   * 下个大版本删除 `NuwaIdentityKit.createNIP1Signature / verifyNIP1Signature`，全部走 `DIDAuth.v1.*`。  
4. **将链上细节下沉**  
   * `RoochVDROperationOptions` 精简为通用字段（`signer`、`keyId`），高级链上参数放入 `advanced?: {...}`，或单独暴露 `RoochTxnOptions` 供高阶用户使用。

---

## 2. 初始化流程 & 使用便利性

### 评估角度
* 新手从 README 复制示例是否能 **一次跑通**。  
* 初始化步骤是否过多，参数是否必要/可推导。  
* 跨模块组合 (`IdentityKit` + `VDR` + `Signer`) 是否直观。

### 发现的问题
1. **初始化信息分散**  
   * 示例中同时出现 `RoochVDR.createDefault()`、`createDefaultVDRs()`、`VDRRegistry.getInstance().registerVDR()` 三种方式，容易让人困惑。  
2. **Signer / KeyManager 依赖链**  
   * `KeyManager` *可能* 需要先 `setDid()` 再生成密钥，否则报错，顺序不易察觉。  
3. **DIDAuth 与核心解耦但文档未强调**  
   * 很多示例继续从 `NuwaIdentityKit` 里调用旧签名 API，阻碍用户理解分层设计。

### 改进建议
1. **提供统一工厂函数**  
   ```ts
   const kit = await IdentityKit.init({
     method: 'rooch',          // 自动注入 RoochVDR
     storage: 'local',         // 自动创建 BrowserLocalStorageKeyStore
     keyType: 'Ed25519',       // 可选，默认 Ed25519
   });
   ```
   *内部* 完成：KeyStore ➜ KeyManager ➜ Signer ➜ VDR ➜ IdentityKit 实例。
2. **DSL 风格链式 API**  
   * 支持 `IdentityKitBuilder`：`IdentityKit.builder().useVDR(rooch).useSigner(signer).build()`，便于高级用户定制。  
3. **精简 README Quick-Start**  
   * 保留最短路径（"两行代码"创建或加载 DID），其它场景移到 *进阶使用*。

---

## 3. 重复或待删除的方法

### 发现的问题
| 模块 | 冗余方法 | 说明 |
|------|----------|------|
| `NuwaIdentityKit` | `createNIP1Signature`, `verifyNIP1Signature` | 已迁移到 `DIDAuth.v1`，应删除 |
| `NuwaIdentityKit` | `operationalPrivateKeys` 相关 getter/setter | 按 *DIDAuth 重构方案* 已标记废弃 |
| `KeyStoreSigner` & `KeyManager` | 皆实现 `SignerInterface`，部分签名逻辑重复 | 应收敛到 `KeyManager` |
| `KeyVDR` & `AbstractVDR` | 部分工具函数 (`extractFragmentFromId` 等) 重复 | 可提取到 `vdr/utils.ts` |

### 改进建议
* **删除** 上表列出的旧 API，保证 `v1` 版本只有一条签名逻辑路径。
* **合并** 重复工具函数，避免维护成本。

---

## 4. 应考虑内置的额外模块

### 建议
1. **默认 DID 解析缓存**  
   * 目前 SDK 自带 `InMemoryLRUDIDDocumentCache`，但未在 `VDRRegistry` 默认启用。应在 `IdentityKit.init()` 时自动注入 5 分钟 TTL 缓存，可通过参数关闭。
2. **轻量级调试日志器**  
   * 常见疑难：签名失败、链上交易失败。建议内置 `DebugLogger`，支持 `debug`, `info`, `warn`, `error` 四级，编译时可 tree-shake。
3. **内置 DID Document 验证工具**  
   * `validators/did-document-validator.ts` 已存在，但示例较少。提供 `identityKit.validate(doc)` 快捷方法，开发者更易发现文档不合法的问题。
4. **高阶 Helper：Domain-specific Service Builders**  
   * 如 `LLMGatewayServiceBuilder`, `CustodianServiceBuilder`，封装常见 `serviceEndpoint` 中的固定字段，提高可读性。

---

## 5. 其他评审要点

### 5.1 文档与示例一致性
* **问题**：部分示例使用旧包名 `nuwa-identity-kit`，而 `package.json` 中声明 `@nuwa-ai/identity-kit`。
* **建议**：统一包名，并在 *Breaking Changes* 中声明更改。

### 5.2 Tree-shaking 体积
* `@noble/curves` / `@noble/hashes` 已为 ESM，可被 Rollup / Webpack 摇树，但需确保 SDK 本身不使用 `require()` fallback。
* 建议在 `tsup` config 添加 `treeshake: true` 并生成 `size-snapshot` 供 CI 检查。

### 5.3 类型冗余
* `types.ts` 文件过大（400+ 行），维护成本高。可按 **功能域** 拆分为 `did.ts`, `crypto.ts`, `service.ts`, `signer.ts` 等。

### 5.4 安全缺省
* `WebAuthnSigner` 暴露 `credentialId` 给外层，若开发者错误记录日志可能泄漏隐私。建议改为私有字段，并提供遮蔽版 getter（返回前 4 后 4）。

---

## 总结
在保持 **NIP-1/NIP-3 兼容** 的前提下，本次发布前的重构目标应聚焦：

1. **API 简洁统一** – 去除重复方法，统一命名与导出路径。  
2. **开箱即用** – 提供 `IdentityKit.init()` 快捷入口，减少样板代码。  
3. **文档先行** – 更新 README 与示例，确保初学者 5 分钟可上手。  
4. **可维护性** – 模块拆分、日志工具、默认缓存，降低长期维护成本。

落地顺序建议：

| 阶段 | 任务 | 说明 |
|------|------|------|
| **0.9.0-beta ➜ 0.9.1** | 删除冗余 API，整理命名 | 不影响使用示例 |
| **0.9.2** | 引入 `IdentityKit.init()` & Builder | 文档同时更新 |
| **1.0.0-rc** | 代码冻结，补充单测 & 体积对比 | CI 通过后打标签 |
| **1.0.0** | 正式发布 | 发布 blog & migration guide |

---

**以上即为 v1 发布前的最终 Review 与重构建议**。 