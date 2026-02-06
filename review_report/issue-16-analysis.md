# Issue #16 分析：payerKey vs payee_id 命名不对称问题

## 当前设计分析

### 字段命名对比

| 角色      | 当前字段名 | 类型   | 用途                                          |
| --------- | ---------- | ------ | --------------------------------------------- |
| **Payer** | `payerKey` | string | 用于解析验证方法以验证 `payer_signature`      |
| **Payee** | `payee_id` | string | 用于标识收款方，验证是否匹配 channel receiver |

### 不对称的表现

```json
{
  "payerKey": "did:rooch:0x...#key-1",    // ← 为什么叫 Key?
  "receipt": {
    "payee_id": "did:rooch:0xdef...",     // ← 为什么叫 id?
    ...
  }
}
```

**问题**:

1. ❌ 命名不一致：一个用 `Key`，一个用 `_id`
2. ❌ 语义混淆：两者都可以是 DID，为什么命名不同？
3. ❌ 理解障碍：开发者不清楚为什么要区别对待

---

## 为什么会这样设计？

### 推测的原因

1. **`payerKey` 的语义**：
   - 强调这是一个用于**签名验证**的密钥标识符
   - 需要能够解析到公钥或验证方法
   - 在 DID 场景下，是 `did:method:identifier#fragment` 的完整形式

2. **`payee_id` 的语义**：
   - 只是一个**标识符**，用于匹配 channel 的 receiver
   - 不需要解析密钥或验证签名
   - 可能只是地址或 DID（不需要 fragment）

### 在不同绑定中的表现

#### Rooch 绑定

```json
{
  "payerKey": "did:rooch:0x123...#key-1", // DID + fragment
  "receipt": {
    "payee_id": "did:rooch:0xdef..." // 可能是 DID 或地址
  }
}
```

#### EVM 绑定

```json
{
  "payerKey": "0x857b0651...", // EOA address
  "receipt": {
    "payee_id": "0x209693Bc..." // 地址
  }
}
```

---

## 解决方案选项

### 方案 A：统一为 `*_id` ✅ **推荐**

```json
{
  "payer_id": "did:rooch:0x...#key-1",
  "receipt": {
    "payee_id": "did:rooch:0xdef...",
    ...
  }
}
```

**优点**:

- ✅ 完全对称，清晰一致
- ✅ 符合 x402 的 snake_case 约定
- ✅ `_id` 的语义足够通用（identifier）
- ✅ 在文档中可以明确说明 `payer_id` 用于密钥解析

**缺点**:

- ⚠️ **破坏性修改**：需要更新所有已有实现
- ⚠️ 失去了 "key" 的提示性（但可以通过文档说明）

---

### 方案 B：统一为 `*Key`

```json
{
  "payerKey": "did:rooch:0x...#key-1",
  "receipt": {
    "payeeKey": "did:rooch:0xdef...",      // ← 改这里
    ...
  }
}
```

**优点**:

- ✅ 对称
- ✅ `payerKey` 不需要改（破坏性小一些）

**缺点**:

- ❌ **语义错误**：`payeeKey` 并不是一个"密钥"，它不用于签名验证
- ❌ 与 x402 的 snake_case 约定不一致（`payerKey` 应该是 `payer_key`）
- ❌ 仍然需要破坏性修改

---

### 方案 C：更明确的命名

```json
{
  "payer_verification_key": "did:rooch:0x...#key-1",
  "receipt": {
    "payee_address": "did:rooch:0xdef...",
    ...
  }
}
```

**优点**:

- ✅ 语义非常明确

**缺点**:

- ❌ 名称过长
- ❌ 破坏性修改
- ❌ `payee_address` 的命名不准确（可能是 DID，不只是 address）

---

### 方案 D：保持不对称，但完善文档说明 ⚠️

```json
{
  "payerKey": "did:rooch:0x...#key-1",    // 保持现状
  "receipt": {
    "payee_id": "did:rooch:0xdef...",     // 保持现状
    ...
  }
}
```

**优点**:

- ✅ **无破坏性修改**
- ✅ 保留现有实现

**缺点**:

- ❌ 命名不一致仍然存在
- ❌ 开发者体验不佳

---

## 深入分析：实际使用场景

### Payer 侧（签名方）

```typescript
// payerKey 的使用
const payerKey = 'did:rooch:0x123...#key-1';

// 1. 解析 DID Document
const didDoc = await resolveDID(payerKey);

// 2. 找到对应的 verification method
const vm = didDoc.verificationMethod.find(v => v.id.endsWith('#key-1'));

// 3. 用 vm 的公钥验证签名
const isValid = verify(vm.publicKey, signature, message);
```

### Payee 侧（收款方）

```typescript
// payee_id 的使用
const payeeId = 'did:rooch:0xdef...';

// 只需要匹配，不需要解析密钥
if (channel.receiver !== payeeId) {
  throw new Error('Payee mismatch');
}
```

**观察**：虽然用途不同，但都是"标识符"，只是 payer 的标识符需要能解析到验证方法。

---

## 我的推荐：方案 A（统一为 `*_id`）

### 理由

1. **一致性最重要**：在协议设计中，一致性比保留现有命名更重要
2. **语义足够准确**：`payer_id` 仍然可以表示"用于标识和验证 payer 的标识符"
3. **符合约定**：snake_case 符合 x402 JSON transport 的约定
4. **文档可以补偿**：通过文档明确说明 `payer_id` 的用途

### 具体实施

#### 1. 核心规范修改

```markdown
- `payer_id` (string): Identifier for the payer, used to resolve the verification method for signature verification. The interpretation (DID key reference, on-ledger key, JWK URL, etc.) is defined by the network binding.
  - For DID-based bindings (e.g., Rooch): MUST be a DID with fragment (e.g., `did:rooch:0x...#key-1`)
  - For address-based bindings (e.g., EVM): MAY be an address (e.g., `0x857b...`)
```

#### 2. 字段重命名对照表

| 旧字段名   | 新字段名   | 位置                     |
| ---------- | ---------- | ------------------------ |
| `payerKey` | `payer_id` | X-PAYMENT payload 根级别 |
| `payee_id` | `payee_id` | 保持不变（已经对称）     |

#### 3. 示例更新

**核心规范示例**:

```json
{
  "version": 1,
  "payer_id": "did:rooch:0x...#key-1",    // ← 改名
  "clientTxRef": "c-20251027-0001",
  "receipt": {
    "channel_id": "0xabc123...",
    "payee_id": "did:rooch:0xdef...",      // ← 已对称
    ...
  }
}
```

**EVM 绑定多种格式示例**（解决 Issue #16 原问题）:

````markdown
### payer_id format examples

**EOA (Externally Owned Account)**:

```json
{ "payer_id": "0x857b06519E91e3A54538791bDbb0E22373e36b66" }
```
````

**Contract wallet (EIP-1271)**:

```json
{ "payer_id": "0x1234567890abcdef..." } // Contract address
```

**DID (optional)**:

```json
{ "payer_id": "did:ethr:0x857b06519E91e3A54538791bDbb0E22373e36b66" }
{ "payer_id": "did:pkh:eip155:1:0x857b06519E91e3A54538791bDbb0E22373e36b66" }
```

\`\`\`

````

---

## 替代方案：最小破坏性方案

如果担心破坏性修改，可以考虑：

### 方案 E：添加别名，逐步迁移

1. **第一阶段**：同时支持两个字段名
   ```json
   {
     "payerKey": "...",    // 保留（deprecated）
     "payer_id": "...",    // 推荐
     "receipt": { "payee_id": "..." }
   }
````

2. **第二阶段**：文档标注 `payerKey` 为 deprecated

3. **第三阶段**（若干版本后）：移除 `payerKey` 支持

**优点**:

- ✅ 向后兼容
- ✅ 给实现者时间迁移

**缺点**:

- ⚠️ 增加复杂度
- ⚠️ 迁移周期长

---

## 问题汇总

请您决策：

### Q1: 是否接受破坏性修改？

- **选项 A**: 接受（推荐方案 A：统一为 `*_id`）
- **选项 B**: 不接受（方案 D：保持现状 + 文档说明）
- **选项 C**: 部分接受（方案 E：别名 + 逐步迁移）

### Q2: 如果统一命名，使用哪个？

- **选项 A**: `payer_id` + `payee_id` （推荐）
- **选项 B**: `payerKey` + `payeeKey`
- **选项 C**: 其他建议？

### Q3: Issue #16 的多格式示例

无论 Q1 选哪个，都应该添加 EVM 绑定的多格式示例：

- EOA address
- Contract wallet address
- DID (did:ethr, did:pkh)

---

## 我的最终推荐

1. ✅ **接受破坏性修改**，统一为 `payer_id` + `payee_id`
2. ✅ 在所有文档中明确说明 `payer_id` 用于密钥解析
3. ✅ 添加多格式示例（解决 Issue #16）
4. ✅ 考虑现在正处于提案阶段，Rooch 是参考实现但尚未广泛部署，是修改的最佳时机

**理由**:

- 协议还在提案/早期阶段（EVM 还是 proposal，Rooch 是 testnet）
- 一致性对长期维护和开发者体验至关重要
- 现在修改的成本远低于协议广泛部署后

您的想法？
