# 命名习惯统一方案分析

## 问题总结

当前文档中存在命名风格不一致的问题：

### 1. **scheme_channel.md** (核心规范)

- ❌ **混合使用**：
  - snake_case: `channel_id`, `sub_channel_id`, `epoch`, `accumulated_amount`, `nonce`, `payee_id`, `payer_id`
  - camelCase: `clientTxRef` ⚠️

### 2. **scheme_channel_evm.md** (EVM 绑定)

- ✅ **已明确区分**（通过字段映射表）：
  - JSON transport: snake_case (`channel_id`, `sub_channel_id`)
  - EIP-712 (Solidity): camelCase (`channelId`, `subChannelId`)

### 3. **scheme_channel_rooch.md** (Rooch 绑定)

- ✅ **已明确区分**（通过字段映射表）：
  - JSON transport: snake_case (`channel_id`, `sub_channel_id`)
  - Move: snake_case (`vm_id_fragment`, `channel_epoch`)

### 4. **nip-4.md** (NIP-4 标准)

- ✅ **统一 snake_case**：
  - `chain_id`, `channel_id`, `channel_epoch`, `vm_id_fragment`, `accumulated_amount`, `nonce`
  - `client_tx_ref`, `service_tx_ref` ← 也是 snake_case

### 5. **IPaymentChannelContract.ts** (TypeScript 实现)

- ✅ **统一 camelCase**：
  - `channelId`, `vmIdFragment`, `payerDid`, `payeeDid`, `clientTxRef`
  - 符合 TypeScript/JavaScript 约定

---

## 关键发现

### x402 核心规范的命名习惯

查看 `x402-specification.md`，x402 **使用 camelCase**：

```json
{
  "x402Version": 1, // camelCase
  "scheme": "exact",
  "network": "base-sepolia",
  "maxAmountRequired": "10000", // camelCase
  "payTo": "0x209693...", // camelCase
  "maxTimeoutSeconds": 60, // camelCase
  "payload": {
    "signature": "0x...",
    "authorization": {
      "from": "0x857b...",
      "to": "0x209693...",
      "value": "10000",
      "validAfter": "1740672089", // camelCase
      "validBefore": "1740672154", // camelCase
      "nonce": "0x..."
    }
  }
}
```

**结论**：x402 核心协议使用 **camelCase** 作为 JSON transport 的命名规范。

---

## 问题根源分析

### 为什么会出现不一致？

1. **NIP-4 的影响**：
   - NIP-4 是独立的协议标准，使用 snake_case
   - Channel scheme 的设计参考了 NIP-4
   - 导致 channel scheme 继承了 NIP-4 的 snake_case 习惯

2. **字段映射的复杂性**：
   - EVM: JSON (snake_case) ↔ EIP-712 (camelCase)
   - Rooch: JSON (snake_case) ↔ Move (snake_case)
   - 为了对齐 Rooch Move 的 snake_case，JSON transport 也用了 snake_case

3. **`clientTxRef` 的来源**：
   - 这个字段可能是从 x402 或 NIP-4 的 HTTP 绑定中借鉴的
   - NIP-4 使用 `client_tx_ref`（snake_case）
   - 但在迁移到 channel scheme 时误用了 camelCase

---

## 统一方案

### 方案 A：统一为 camelCase ✅ **推荐**

**理由**：

1. ✅ **与 x402 核心规范对齐**：x402 使用 camelCase
2. ✅ **减少混淆**：只有一种风格，更清晰
3. ✅ **实现已经对齐**：TypeScript 实现使用 camelCase
4. ✅ **EVM 开发者友好**：JSON 和 EIP-712 命名更接近

**需要修改的字段**：

| 当前名称 (snake_case) | 统一后 (camelCase)  |
| --------------------- | ------------------- |
| `channel_id`          | `channelId`         |
| `sub_channel_id`      | `subChannelId`      |
| `accumulated_amount`  | `accumulatedAmount` |
| `payee_id`            | `payeeId`           |
| `payer_id`            | `payerId`           |
| `chain_id`            | `chainId`           |
| `payer_signature`     | `payerSignature`    |
| `client_tx_ref`       | `clientTxRef`       |

**字段映射表更新**：

#### EVM 绑定

```markdown
| JSON Field (Transport) | EIP-712 Field (On-chain) | Notes         |
| ---------------------- | ------------------------ | ------------- |
| `channelId`            | `channelId`              | ✅ 命名统一！ |
| `subChannelId`         | `subChannelId`           | ✅ 命名统一！ |
| `accumulatedAmount`    | `accumulatedAmount`      | ✅ 命名统一！ |
```

#### Rooch 绑定

```markdown
| JSON Field (Transport) | Move Field (SubRAV) | Notes                            |
| ---------------------- | ------------------- | -------------------------------- |
| `channelId`            | `channel_id`        | JSON camelCase → Move snake_case |
| `subChannelId`         | `vm_id_fragment`    | 名称和风格都不同                 |
| `epoch`                | `channel_epoch`     | 名称有差异                       |
```

**优点**：

- ✅ 与 x402 核心规范对齐
- ✅ 统一风格，减少混淆
- ✅ TypeScript 实现无需修改
- ✅ EVM JSON 和 EIP-712 命名一致

**缺点**：

- ⚠️ Rooch 绑定的字段映射表仍然需要转换
- ⚠️ 与 NIP-4 不一致（但 NIP-4 是独立标准，可以保持差异）

---

### 方案 B：统一为 snake_case

**理由**：

1. ✅ 与 NIP-4 对齐
2. ✅ Rooch Move 字段映射更简单（都是 snake_case）
3. ✅ 已经有大量字段使用 snake_case

**需要修改的字段**：

| 当前名称 (camelCase) | 统一后 (snake_case) |
| -------------------- | ------------------- |
| `clientTxRef`        | `client_tx_ref`     |

**优点**：

- ✅ 与 NIP-4 对齐
- ✅ Rooch 绑定的映射更简单
- ✅ 修改量最小（只需改 `clientTxRef`）

**缺点**：

- ❌ **与 x402 核心规范不一致** ← 严重问题
- ❌ EVM 绑定需要转换：JSON snake_case → EIP-712 camelCase
- ❌ TypeScript 实现需要大量修改

---

### 方案 C：分层命名（不推荐）

**方案**：

- x402 JSON transport 层：camelCase
- 链特定实现层：各自的约定（EVM camelCase, Move snake_case）

**优点**：

- ✅ 符合各层的原生约定

**缺点**：

- ❌ 增加复杂度
- ❌ 开发者需要记住多套规则
- ❌ 容易出错

---

## 最终推荐：方案 A（统一为 camelCase）

### 决策理由

1. **协议一致性优先**：
   - channel scheme 是 x402 的扩展 scheme
   - 必须遵循 x402 核心规范的命名约定
   - x402 使用 camelCase，channel scheme 也应该使用

2. **减少转换复杂度**：
   - EVM: JSON camelCase → EIP-712 camelCase（无转换）
   - Rooch: JSON camelCase → Move snake_case（有转换，但 Rooch 已经有字段映射表）

3. **实现友好**：
   - TypeScript/JavaScript 生态使用 camelCase
   - 无需修改现有实现

4. **开发者体验**：
   - 统一风格，更容易理解和使用
   - 字段映射表更清晰

### 与 NIP-4 的关系

- **NIP-4 是独立的协议标准**，不是 x402 的一部分
- NIP-4 的 snake_case 是合理的（它不需要与 x402 对齐）
- channel scheme 作为 x402 的扩展，应该遵循 x402 的约定
- **可以在文档中注明**：NIP-4 使用 snake_case，x402 channel scheme 使用 camelCase

---

## 实施计划

### 第一步：修改核心规范 (scheme_channel.md)

将所有 snake_case 字段改为 camelCase：

```json
// 修改前
{
  "version": 1,
  "payer_id": "did:rooch:0x123...#key-1",
  "clientTxRef": "c-20251027-0001",    // ← 已经是 camelCase
  "receipt": {
    "channel_id": "0xabc123...",       // ← 需要改
    "epoch": 3,
    "sub_channel_id": "device-1",      // ← 需要改
    "accumulated_amount": "1234567890", // ← 需要改
    "nonce": 42,
    "payee_id": "did:rooch:0xdef456...",// ← 需要改
    "payer_signature": "0x..."          // ← 需要改
  }
}

// 修改后
{
  "version": 1,
  "payerId": "did:rooch:0x123...#key-1",
  "clientTxRef": "c-20251027-0001",
  "receipt": {
    "channelId": "0xabc123...",
    "epoch": 3,
    "subChannelId": "device-1",
    "accumulatedAmount": "1234567890",
    "nonce": 42,
    "payeeId": "did:rooch:0xdef456...",
    "payerSignature": "0x..."
  }
}
```

### 第二步：更新 EVM 绑定 (scheme_channel_evm.md)

**字段映射表简化**：

```markdown
## Field name mapping

**好消息**：由于 JSON transport 现在使用 camelCase，与 EIP-712 的 camelCase 完全一致，字段映射大大简化！

| JSON Field (Transport) | JSON Type        | EIP-712 Field (On-chain) | EIP-712 Type | Notes           |
| ---------------------- | ---------------- | ------------------------ | ------------ | --------------- |
| `channelId`            | string (hex)     | `channelId`              | bytes32      | ✅ 名称一致     |
| `epoch`                | number\|string   | `epoch`                  | uint64       | ✅ 名称一致     |
| `subChannelId`         | string (hex)     | `subChannelId`           | bytes32      | ✅ 名称一致     |
| `accumulatedAmount`    | string (decimal) | `accumulatedAmount`      | uint256      | ✅ 名称一致     |
| `nonce`                | number\|string   | `nonce`                  | uint64       | ✅ 名称一致     |
| `payeeId`              | string (address) | `payee`                  | address      | ⚠️ 字段名有差异 |

Additional notes:

- **chainId**: Not included in receipt (provided by EIP-712 domain separator)
- **asset**: Not included in receipt (implicitly bound to channelId)
- **payerSignature**: EIP-712 signature bytes
```

### 第三步：更新 Rooch 绑定 (scheme_channel_rooch.md)

**字段映射表更新**：

```markdown
#### Complete field mapping (Move SubRAV ↔ JSON Transport)

| JSON Field (Transport) | JSON Type        | Move Field (SubRAV)  | Move Type | Notes                               |
| ---------------------- | ---------------- | -------------------- | --------- | ----------------------------------- |
| `version`              | number           | `version`            | u8        | ✅ 名称一致                         |
| `chainId`              | number\|string   | `chain_id`           | u64       | JSON camelCase → Move snake_case    |
| `channelId`            | string (hex)     | `channel_id`         | ObjectID  | JSON camelCase → Move snake_case    |
| `epoch`                | number\|string   | `channel_epoch`      | u64       | JSON `epoch` → Move `channel_epoch` |
| `subChannelId`         | string           | `vm_id_fragment`     | String    | 名称和风格都不同                    |
| `accumulatedAmount`    | string (decimal) | `accumulated_amount` | u256      | JSON camelCase → Move snake_case    |
| `nonce`                | number\|string   | `nonce`              | u64       | ✅ 名称一致                         |

#### Fields NOT in SubRAV (handled separately)

| JSON Field (Transport) | Purpose                                            |
| ---------------------- | -------------------------------------------------- |
| `payerId`              | DID key identifier (e.g., `did:rooch:0x...#key-1`) |
| `payeeId`              | Payee DID or address                               |
| `payerSignature`       | Hex-encoded signature bytes                        |
```

### 第四步：更新所有示例

在三个文档中更新所有 JSON 示例，使用 camelCase。

### 第五步：添加与 NIP-4 的关系说明

在 `scheme_channel.md` 的开头或末尾添加说明：

```markdown
## Relationship to NIP-4

This `channel` scheme is inspired by and compatible with the concepts defined in [NIP-4](https://github.com/nuwa-protocol/NIPs/blob/main/nips/nip-4.md). However, there are some differences:

**Naming conventions**:

- **NIP-4**: Uses snake_case for JSON fields (e.g., `channel_id`, `sub_channel_id`) as it is an independent protocol standard.
- **x402 channel scheme**: Uses camelCase for JSON transport fields (e.g., `channelId`, `subChannelId`) to align with x402 core protocol conventions.

The semantic meaning and behavior of fields remain the same; only the JSON field names differ. Implementations bridging between NIP-4 and x402 should perform name mapping:

| NIP-4 (snake_case)   | x402 channel (camelCase) |
| -------------------- | ------------------------ |
| `channel_id`         | `channelId`              |
| `sub_channel_id`     | `subChannelId`           |
| `accumulated_amount` | `accumulatedAmount`      |
| `client_tx_ref`      | `clientTxRef`            |
```

---

## 破坏性影响评估

### 对现有实现的影响

#### 1. TypeScript 实现 (IPaymentChannelContract.ts)

- ✅ **无需修改**：已经使用 camelCase

#### 2. Move 合约 (payment_channel.move)

- ✅ **无需修改**：Move 层使用 snake_case（不受影响）
- ⚠️ JSON 序列化/反序列化需要字段映射（已有）

#### 3. 文档

- ⚠️ 需要修改三个文档的所有示例和字段定义

#### 4. 测试和集成

- ⚠️ 现有测试代码需要更新字段名

### 迁移成本

| 影响范围           | 成本 | 缓解措施         |
| ------------------ | ---- | ---------------- |
| **文档**           | 中等 | 批量搜索替换     |
| **TypeScript SDK** | 低   | 已经是 camelCase |
| **Move 合约**      | 无   | 不受影响         |
| **测试**           | 中等 | 更新测试数据     |
| **现有集成**       | 高   | 提供迁移指南     |

---

## 替代方案：渐进式迁移

如果担心破坏性太大，可以考虑：

### 同时支持两种命名（不推荐）

在解析 JSON 时同时接受 snake_case 和 camelCase：

```typescript
// 解析时兼容两种格式
const channelId = payload.channelId || payload.channel_id;
const subChannelId = payload.subChannelId || payload.sub_channel_id;
```

**缺点**：

- ❌ 增加复杂度
- ❌ 容易出错
- ❌ 不利于长期维护

---

## 总结和建议

### 推荐：方案 A（统一为 camelCase）

1. ✅ **与 x402 核心规范对齐**
2. ✅ **TypeScript 实现无需修改**
3. ✅ **统一风格，减少混淆**
4. ✅ **EVM 绑定映射简化**
5. ⚠️ **Rooch 绑定仍需映射**（但已经有映射表）

### 实施时机

建议**现在立即修改**，因为：

1. 协议还在早期阶段
2. 现在修改比以后修改成本更低
3. 与 Issue #16 (#22, #23) 一起完成，一次性修改所有 breaking changes

### 沟通策略

1. 在 PR 中明确标注这是 breaking change
2. 提供字段名对照表
3. 更新所有文档和示例
4. 在 CHANGELOG 中详细说明

---

**修改完成后的收益**：

- ✅ 完全符合 x402 规范
- ✅ 命名统一，开发者体验更好
- ✅ 减少理解和使用的门槛
- ✅ 为未来扩展打下良好基础
