# Issue #16 修改总结：payerKey → payer_id 命名统一

**Issue ID**: #16 (Critical)  
**修改日期**: 2025-10-27  
**相关 Issue**: 涉及术语一致性（Issue #23 也部分相关）

---

## 问题描述

**原问题**: 核心规范和绑定文档中存在命名不对称：

- ❌ **Payer** 使用 `payerKey`
- ❌ **Payee** 使用 `payee_id`
- ❌ 一个用 Key，一个用 \_id，不一致且令人困惑
- ❌ `payerKey` 的多种格式（EOA、Contract wallet、DID）没有明确示例

**影响**:

1. 开发者难以理解为什么 payer 和 payee 的命名方式不同
2. 不清楚 `payerKey` 是否只能是"密钥"，还是可以是地址或 DID
3. 命名不对称影响 API 的直观性和一致性

**来源**: Review 报告 Line 293-296

---

## 解决方案

### 统一命名为 `payer_id` + `payee_id`

**核心决策**:

1. ✅ 将 `payerKey` 改为 `payer_id`，与 `payee_id` 对称
2. ✅ 在核心规范中用**抽象的方式**描述 `payer_id`，支持多种身份方案
3. ✅ 在各个绑定中具体化，展示该绑定支持的格式（附带示例）
4. ✅ 符合 x402 JSON transport 的 snake_case 约定

**为什么选择 `_id` 而不是 `Key`?**

- `_id` 更通用：identifier 可以是 DID、地址、密钥引用等
- `Key` 语义过窄：`payee_id` 并不用于签名，称为 `payeeKey` 不准确
- `_id` 对称且一致：两者都是标识符，只是用途不同

---

## 核心设计原则

### 抽象表达（核心规范）

在 `scheme_channel.md` 中，用**抽象的方式**描述 `payer_id`：

```markdown
- `payer_id` (string): Identifier for the payer, used to resolve the verification method for signature verification. The interpretation is defined by the network binding:
  - For DID-based bindings: a DID with optional fragment (e.g., `did:method:identifier` or `did:method:identifier#fragment`)
  - For address-based bindings: a blockchain address
  - For key-based bindings: a public key reference or JWK URL
  - Bindings MUST document which identifier formats are supported and how they are resolved.
```

**关键点**:

- ✅ 不限定具体格式，只定义语义（"用于解析验证方法"）
- ✅ 列举几种常见的绑定类型（DID、地址、密钥引用）
- ✅ 要求绑定文档必须明确支持的格式和解析方式

### 具体化（绑定文档）

各绑定文档提供**具体的格式示例和支持说明**。

---

## 具体修改

### 修改 1: 核心规范 (scheme_channel.md)

#### 字段定义

**修改前**:

```markdown
- `payerKey` (string): Key identifier for verifying the payer's signature. The interpretation (DID key, on-ledger key, JWK URL, etc.) is defined by the network binding.
```

**修改后**:

```markdown
- `payer_id` (string): Identifier for the payer, used to resolve the verification method for signature verification. The interpretation is defined by the network binding:
  - For DID-based bindings: a DID with optional fragment (e.g., `did:method:identifier` or `did:method:identifier#fragment`)
  - For address-based bindings: a blockchain address
  - For key-based bindings: a public key reference or JWK URL
  - Bindings MUST document which identifier formats are supported and how they are resolved.
```

**改进**:

- ✅ 更明确的分类说明
- ✅ 提供了三种主要的绑定模式示例
- ✅ 要求绑定文档必须明确支持的格式

#### 示例更新

**修改前**:

```json
{
  "version": 1,
  "payerKey": "did:rooch:0x...#key-1",
  ...
}
```

**修改后**:

```json
{
  "version": 1,
  "payer_id": "did:rooch:0x123...#key-1",
  ...
}
```

#### 验证流程

**修改前**:

```markdown
1. Signature validation
   - Resolve `payerKey` per the network binding and verify `payer_signature` over the canonical receipt.
```

**修改后**:

```markdown
1. Signature validation
   - Resolve `payer_id` per the network binding and verify `payer_signature` over the canonical receipt.
```

---

### 修改 2: EVM 绑定 (scheme_channel_evm.md)

#### 新增多格式示例章节

在 "Identity and signatures" 章节开头新增：

````markdown
### payer_id format

The `payer_id` field identifies the payer and is used to resolve the signing key for signature verification. EVM bindings support multiple formats:

**EOA (Externally Owned Account)** - Required:

```json
{ "payer_id": "0x857b06519E91e3A54538791bDbb0E22373e36b66" }
```
````

The address is used directly for `ecrecover` from the EIP-712 signature.

**Contract wallet (EIP-1271)** - Required:

```json
{ "payer_id": "0x1234567890abcdef1234567890abcdef12345678" }
```

The contract address is used to call `isValidSignature(bytes32,bytes)` for verification.

**DID (Decentralized Identifier)** - Optional:

```json
{ "payer_id": "did:ethr:0x857b06519E91e3A54538791bDbb0E22373e36b66" }
{ "payer_id": "did:pkh:eip155:1:0x857b06519E91e3A54538791bDbb0E22373e36b66" }
```

The facilitator resolves the DID to an address (EOA or contract) and then applies the corresponding verification flow.

````

**关键点**:
- ✅ **明确标注支持等级**：EOA 和 EIP-1271 是 Required，DID 是 Optional
- ✅ **提供三种实际格式示例**，解决 Issue #16 原问题
- ✅ **说明验证方式**：每种格式如何被验证

#### 更新文档中的引用

将所有 `payerKey` 改为 `payer_id`：
- Line 63: 要求说明中
- Line 64: 可选支持说明中
- Line 220: 示例中

---

### 修改 3: Rooch 绑定 (scheme_channel_rooch.md)

#### 新增格式说明章节

**修改前**（章节标题）:
```markdown
## Identity and signatures
- `payerKey`: a DID key identifier (e.g., `did:rooch:0x...#key-1`).
- Resolution: ...
````

**修改后**（结构化说明）:

````markdown
## Identity and signatures

### payer_id format

The `payer_id` field is a DID key identifier that includes a fragment to reference a specific verification method:

```json
{ "payer_id": "did:rooch:0x123abc...#key-1" }
```
````

- `did:rooch:0x123abc...`: identifies the DID controller (Rooch account address)
- `#key-1`: fragment referencing a specific verification method in the DID Document

### Resolution and authorization

- Resolution: resolve `did:rooch` → DID Document → `verificationMethod` referenced by fragment (e.g., `#key-1`).
- Authorization model: ...

````

**改进**:
- ✅ 更清晰的结构（格式说明 + 解析说明分开）
- ✅ 详细解释 DID URL 的组成部分
- ✅ 明确 fragment 的作用

#### 更新字段映射表

**修改前**:
```markdown
| `payerKey` | DID key identifier (e.g., `did:rooch:0x...#key-1`) | Used to resolve... |
````

**修改后**:

```markdown
| `payer_id` | DID key identifier (e.g., `did:rooch:0x...#key-1`) | Used to resolve... |
```

#### 更新验证流程和示例

- Line 146: 验证流程步骤 2
- Line 173: `/verify` 请求示例

---

## 修改汇总

### 文件变更统计

| 文件                      | 修改类型                 | 修改数量        |
| ------------------------- | ------------------------ | --------------- |
| `scheme_channel.md`       | 字段定义、示例、验证流程 | 4 处            |
| `scheme_channel_evm.md`   | 新增章节 + 更新引用      | 1 新增 + 3 更新 |
| `scheme_channel_rooch.md` | 重构章节 + 更新引用      | 1 重构 + 3 更新 |

**总计**: 3 个文件，约 12 处修改

### 命名变更对照表

| 旧字段名   | 新字段名   | 位置     | 变化原因                   |
| ---------- | ---------- | -------- | -------------------------- |
| `payerKey` | `payer_id` | 所有文档 | 与 `payee_id` 对称，更一致 |

---

## 对不同角色的影响

### Facilitator 实现者

**之前**:

```typescript
const payerKey = payload.payerKey;
// 不清楚 payerKey 可以是什么格式
```

**现在**:

```typescript
const payerId = payload.payer_id;
// 查看绑定文档，明确知道支持的格式
// EVM: EOA address | Contract address | DID
// Rooch: DID with fragment (did:rooch:0x...#key-1)
```

**改进**:

- ✅ 命名更一致（`payer_id` vs `payee_id`）
- ✅ 绑定文档明确列出支持的格式和验证方式

### 客户端实现者（Payer）

**之前**:

```typescript
// 不确定应该提供什么格式的 payerKey
const payload = {
  payerKey: '???', // Address? DID? Key?
};
```

**现在**:

```typescript
// 查看绑定文档，选择支持的格式
const payload = {
  payer_id: "0x857b..." // EVM: EOA
  // 或
  payer_id: "did:rooch:0x123...#key-1" // Rooch: DID
};
```

**改进**:

- ✅ 绑定文档提供了明确的格式示例
- ✅ 知道哪些格式是 Required，哪些是 Optional

### Payee 实现者

**影响**:

- 无需修改代码（`payee_id` 保持不变）
- 受益于整体命名的一致性

---

## 与其他语言/框架的一致性

### TypeScript/JavaScript

```typescript
interface ChannelPayload {
  version: number;
  payer_id: string; // ← 对称
  clientTxRef?: string;
  receipt: {
    channel_id: string;
    payee_id: string; // ← 对称
    // ...
  };
}
```

### Python

```python
class ChannelPayload:
    version: int
    payer_id: str      # 对称
    client_tx_ref: Optional[str]
    receipt: Receipt

class Receipt:
    channel_id: str
    payee_id: str      # 对称
```

### Rust

```rust
pub struct ChannelPayload {
    pub version: u8,
    pub payer_id: String,    // 对称
    pub client_tx_ref: Option<String>,
    pub receipt: Receipt,
}

pub struct Receipt {
    pub channel_id: String,
    pub payee_id: String,    // 对称
    // ...
}
```

**一致性**:

- ✅ 所有语言中 `payer_id` 和 `payee_id` 保持对称
- ✅ 符合各语言的命名约定（snake_case）

---

## 向后兼容性

### 破坏性修改

⚠️ **这是一个破坏性修改**：

- 所有实现需要将 `payerKey` 改为 `payer_id`
- JSON payload 字段名发生变化

### 为什么现在是最佳修改时机？

1. ✅ **协议处于早期阶段**：
   - EVM 绑定还是 **proposal**，尚未有生产实现
   - Rooch 绑定是 **testnet** 参考实现，部署范围有限

2. ✅ **避免技术债务**：
   - 不一致的命名会长期影响开发者体验
   - 越晚修改，迁移成本越高

3. ✅ **与其他修改配合**：
   - Issue #1: 资产绑定模型
   - Issue #22: `channel_id` 格式统一
   - Issue #23: 术语统一
   - 一次性完成所有 breaking changes，减少迁移次数

### 迁移指南（实现者）

#### 1. 修改 JSON payload 解析

**Before**:

```typescript
const { payerKey, receipt } = payload;
```

**After**:

```typescript
const { payer_id, receipt } = payload;
```

#### 2. 更新类型定义

**Before**:

```typescript
interface Payload {
  payerKey: string;
}
```

**After**:

```typescript
interface Payload {
  payer_id: string;
}
```

#### 3. 更新文档引用

- 搜索所有 `payerKey` 引用
- 替换为 `payer_id`
- 添加绑定特定的格式示例

---

## 与 Issue #23（术语统一）的关系

Issue #16 和 Issue #23 共同解决了命名一致性问题：

| Issue         | 解决的问题                                                       | 方案                           |
| ------------- | ---------------------------------------------------------------- | ------------------------------ |
| **Issue #23** | 不同文档间字段命名不一致（`sub_channel_id` vs `vm_id_fragment`） | 创建字段映射表                 |
| **Issue #16** | Payer 和 Payee 字段命名不对称（`payerKey` vs `payee_id`）        | 统一为 `payer_id` + `payee_id` |

**配合效果**:

- ✅ JSON transport 层：完全对称（`payer_id` / `payee_id`）
- ✅ 绑定层：通过映射表明确本地命名（如 Move 的 `vm_id_fragment`）
- ✅ 开发者体验：直观、一致、易于理解

---

## 后续建议

虽然 Issue #16 已完全解决，但可以进一步完善：

### 1. 在绑定文档中添加格式验证规则

例如在 EVM 绑定中：

```markdown
### payer_id validation

Facilitators SHOULD validate `payer_id` format:

- EOA/Contract: MUST be a valid 20-byte hex address (0x-prefixed, checksum optional)
- DID: MUST match pattern `did:ethr:<address>` or `did:pkh:eip155:<chainId>:<address>`
```

### 2. 提供正则表达式示例

```markdown
**EOA/Contract address**:
```

^0x[a-fA-F0-9]{40}$

```

**DID (did:ethr)**:
```

^did:ethr:0x[a-fA-F0-9]{40}$

```

**DID (did:pkh)**:
```

^did:pkh:eip155:\d+:0x[a-fA-F0-9]{40}$

```

```

### 3. 错误码建议

定义 `payer_id` 格式错误的错误码：

| 错误码                       | 场景                                         | HTTP Status |
| ---------------------------- | -------------------------------------------- | ----------- |
| `invalid_payer_id_format`    | `payer_id` 格式不符合绑定规范                | 400         |
| `unsupported_payer_id_type`  | 绑定不支持该类型（如只支持 EOA，但收到 DID） | 400         |
| `payer_id_resolution_failed` | DID 解析失败                                 | 400         |

---

## 验证清单

- [x] 核心规范的字段定义已更新
- [x] 核心规范的示例已更新（2 处）
- [x] 核心规范的验证流程已更新
- [x] EVM 绑定新增了 `payer_id` 格式章节
- [x] EVM 绑定提供了 3 种格式示例（EOA、Contract、DID）
- [x] EVM 绑定的所有引用已更新
- [x] Rooch 绑定重构了身份章节
- [x] Rooch 绑定的字段映射表已更新
- [x] Rooch 绑定的验证流程和示例已更新
- [x] 所有文档中 `payerKey` 已完全替换为 `payer_id`

### 全局搜索验证

```bash
# 确认没有遗漏的 payerKey 引用
grep -r "payerKey" deps/x402/specs/schemes/channel/
# 应该返回 0 结果
```

---

**修改完成日期**: 2025-10-27  
**下一步**: 可以继续解决其他 Important/Minor issues，或生成最终的修改总结报告
