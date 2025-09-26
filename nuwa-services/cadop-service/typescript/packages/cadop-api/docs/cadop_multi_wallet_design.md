# CADOP 多钱包（did:key + did:bitcoin）Agent DID 创建设计

> 目标：在保持现有 Passkey（did:key）流程不变的前提下，新增 Bitcoin 钱包创建 Agent DID（did:bitcoin）的能力，并统一到“控制者 DID + 可选公钥/类型”的通用 CADOP 创建链路。

---

## 1. 背景与目标

- 现状：`cadop-api` 已支持基于 WebAuthn 的 Passkey 登录/验证，随后由 Custodian 服务通过 CADOP 协议在链上创建 Agent DID（当前控制者为 did:key）。
- 新需求：支持使用 Bitcoin 钱包（did:bitcoin）作为控制者 DID 创建 Agent DID。
- 约束：
  - 向后兼容：保留现有 Passkey 路由与行为不变。
  - 统一 CADOP 创建链路到“控制者 DID + 可选公钥/类型 + 可选 scopes”，映射到合约新增入口：
    - `create_did_object_via_cadop_with_controller_and_scopes_entry`

---

## 2. 总体方案

- 引入 Provider 抽象：`webauthn`（现有）、`bitcoin`（新增），后续可扩展 `ethereum` 等。
- IdP 层按 Provider 验证“控制者 DID 的所有权”，并签发包含必要声明的 JWT（`provider`、`sub=controllerDid`、`controllerPublicKeyMultibase`、`controllerVMType` 等）。
- Custodian 层读取 JWT，基于 `provider` 或 `sub` 选择调用：
  - did:key：走既有路径（可继续使用 `createDID`）。
  - did:bitcoin：走“控制者模式”新路径，调用 `createDIDWithController`，最终由 VDR 调合约新入口。
- CadopIdentityKit 新增 `createDIDWithController` API，对接 Rooch VDR 的“controller + scopes”方法。

---

## 3. IdP API 变化

### 3.1 Challenge 获取（按 Provider）

```
GET /api/idp/challenge?provider=webauthn|bitcoin
```

- webauthn：保持 `{ challenge, nonce }`（需要时可返回 `rpId`）。
- bitcoin：返回 `{ challenge, nonce, messageToSign, network }`，其中 `messageToSign` 建议包含域名、挑战与时间戳以防重放。

说明：挑战和 `nonce` 通过内存 `Map`（带 TTL）维护，默认 5 分钟过期（与现有实现一致）。

### 3.2 Bitcoin 验证接口（新增）

```
POST /api/idp/verify-bitcoin
Content-Type: application/json
{
  "address": string,
  "publicKeyHex": string,          // 压缩公钥 hex
  "signature": string,            // 对 messageToSign 的签名（编码视校验模式而定）
  "challenge": string,
  "nonce": string,
  "network": "mainnet"|"testnet"|"regtest",
  "origin": string                 // 可选：绑定域
}
```

校验要点：
- `challenge/nonce` 匹配且未过期。
- 根据 `publicKeyHex` 推导 `address` 并与入参一致，校验 `network` 一致性。
- 验签模式可配置（默认开发友好，生产建议更严格）：
  - `BTC_VERIFY_MODE=simple|core-msg|bip322`
  - simple：`sha256(messageToSign)` 后使用 `secp256k1` 验签（开发便捷）。
  - core-msg：Bitcoin Core message 签名格式（有“Bitcoin Signed Message:\n”前缀）。
  - bip322：安全性最佳（可后续迭代）。

成功后签发 JWT（见 3.3）。

### 3.3 JWT 载荷

标准声明：
- `iss`=`cadopDid`，`aud`=`cadopDid`，`sub`=`controllerDid`（控制者 DID），`exp/iat/jti/nonce`。

扩展声明：
- `provider`: `webauthn` | `bitcoin` | ...
- `controllerPublicKeyMultibase`: base58btc(publicKeyBytes)
- `controllerVMType`: 建议使用 `EcdsaSecp256k1VerificationKey2019`（或通过 `algorithmToKeyType('secp256k1')` 映射）
- 可选：`network`、`origin`

---

## 4. CustodianService 变更

请求体兼容不变：

```
POST /api/custodian/mint
{
  "idToken": string,
  "userDid": string
}
```

处理：
- 解析 `idToken`：
  - 若 `provider==='bitcoin'` 或 `sub` 以 `did:bitcoin:` 开头：
    - 读取 `sub` 作为 `controllerDid`；从 JWT 取 `controllerPublicKeyMultibase` 与 `controllerVMType`；
    - 调用 `createDIDWithController('rooch', controllerDid, { controllerPublicKeyMultibase, controllerVMType, customScopes })`。
  - 否则沿用现有 did:key 路径（`createDID('rooch', userDid)`）。
- 保持：“每日额度”等配额逻辑与状态机不变。

---

## 5. CadopIdentityKit 扩展

新增 API：

```
createDIDWithController(
  method: 'rooch',
  controllerDid: string,
  options?: {
    controllerPublicKeyMultibase?: string;
    controllerVMType?: string;      // e.g. 'EcdsaSecp256k1VerificationKey2019'
    customScopes?: string[];        // 可选 scopes，形如 "address::module::function"
  }
): Promise<DIDCreationResult>
```

行为：
- `did:key`：如未提供 `controllerPublicKeyMultibase/controllerVMType`，从 did:key 自动提取，保持旧路径兼容。
- `did:bitcoin`：使用“控制者模式”走 Rooch VDR 的 `createDIDViaCADOPWithControllerAndScopes(...)`，映射到合约新入口。

类型：
- 新增 `CADOPControllerCreationRequest`，与现有 `CADOPCreationRequest` 并存。
- 暴露 Provider 常量，便于前后端一致化。

---

## 6. Rooch VDR 扩展

新增：

```
createDIDViaCADOPWithControllerAndScopes(
  params: {
    controllerDidString: string,
    userVmPkMultibase?: string,
    userVmType?: string,
    custodianServicePkMultibase: string,
    custodianServiceVMType: string,
    customScopes?: string[],
  },
  opts: { signer: SignerInterface }
)
```

链上映射：
- `rooch_framework::did::create_did_object_via_cadop_with_controller_and_scopes_entry`
- did:key 控制者：链上自动从 identifier 解析公钥与类型。
- did:bitcoin 控制者：必须提供 `userVmPkMultibase`（公钥）与 `userVmType='EcdsaSecp256k1VerificationKey2019'`，链上会校验地址与类型。

---

## 7. 配置与安全

环境变量（新增）：
- `BTC_NETWORK=mainnet|testnet|regtest`
- `BTC_VERIFY_MODE=simple|core-msg|bip322`
- 可选：`ALLOWED_ORIGINS`（域白名单，配合 CORS 与 `origin` 绑定）

安全建议：
- 将域名与时间戳/随机值纳入 `messageToSign`，配合 `challenge/nonce` 做重放防护。
- JWT 包含 `nonce`，可选引入 Redis/TTL 做“一次性”校验。
- 生产建议使用 `core-msg` 或 `bip322` 验证模式。

---

## 8. 渐进式落地

阶段 A（最小可用）：
- IdP：新增 `/challenge?provider=bitcoin` 与 `/verify-bitcoin`，默认 `simple` 验证模式；签发扩展 JWT。
- IdentityKit：实现 `createDIDWithController`，Rooch VDR 对接合约新入口。
- CustodianService：按 provider 分流（did:key 走旧路径、did:bitcoin 走控制者路径）。
- 文档与 `@cadop/shared` 类型更新；现有 Passkey 路由不变。

阶段 B（增强）：
- 增加 `core-msg`/`bip322` 支持，更严格重放防护与多域白名单。
- 前端（cadop-web/agent）对接钱包：获取压缩公钥、签名、地址。
- 完善单测/集成测试：
  - 挑战过期/重放、验签失败、网络不一致、JWT 扩展字段缺失等。

---

## 9. 影响范围（代码）

- `nuwa-services/cadop-service/typescript/packages/cadop-api/`
  - `src/routes/idp.ts`：新增 `/api/idp/verify-bitcoin`，扩展 challenge。
  - `src/services/IdpService.ts`：新增 Bitcoin 验证与扩展 JWT 签发。
  - `src/services/CustodianService.ts`：按 provider/控制者 DID 分流调用。
  - `src/config/environment.ts`：新增 BTC 相关配置项。
  - 测试：`src/services/__tests__/IdpService.test.ts`、`CustodianService.integration.test.ts` 增补 Bitcoin 用例。

- `nuwa-kit/typescript/packages/identity-kit/`
  - `CadopIdentityKit.ts`：新增 `createDIDWithController`。
  - `vdr/*`：Rooch VDR 新方法直达合约新入口。
  - `types/*`：Provider/请求类型扩展。

---

## 10. 与链上合约的对应

- 入口：
  - `create_did_object_via_cadop_with_controller_and_scopes_entry`
- 控制者 DID：
  - did:key：链上自动解析公钥与类型。
  - did:bitcoin：需要提供 `user_vm_pk_multibase` 与 `user_vm_type='EcdsaSecp256k1VerificationKey2019'`；链上校验地址匹配与类型限制（secp256k1）。

---

## 11. 兼容性

- 现有 Passkey 路由、请求体与 Custodian 调用完全保留。
- 新增能力对旧客户端透明；使用 Bitcoin 的客户端按新增路由/参数接入即可。


