# Issue #23 修改总结：关键术语统一

**Issue ID**: #23 (Critical)  
**修改日期**: 2025-10-27  
**相关 Issues**: 同时解决了 #11（EVM字段映射）和 #18（Rooch字段映射不完整）

---

## 问题描述

三个文档中存在严重的术语不一致问题，影响互操作性和实现一致性：

| 概念           | 核心规范             | EVM 绑定            | Rooch 绑定           | 一致性        |
| -------------- | -------------------- | ------------------- | -------------------- | ------------- |
| Sub-channel ID | `sub_channel_id`     | `subChannelId`      | `vm_id_fragment`     | ❌ 严重不一致 |
| Epoch          | `epoch`              | `epoch`             | `channel_epoch`      | ⚠️ 部分不一致 |
| Accumulated    | `accumulated_amount` | `accumulatedAmount` | `accumulated_amount` | ⚠️ 大小写不同 |
| Payee          | `payee_id`           | `payee`             | `payee_id`           | ⚠️ EVM 不同   |
| Channel ID     | `channel_id`         | `channelId`         | `channel_id`         | ⚠️ 大小写不同 |

---

## 根本原因

不同上下文有不同的命名约定：

- **JSON Transport (x402)**: snake_case（Web API 标准）
- **Solidity (EVM)**: camelCase（Solidity 编程约定）
- **Move (Rooch)**: snake_case（Move 语言约定），但某些字段有专有名称（`vm_id_fragment` 是 DID 相关术语）

之前的文档没有明确说明这些映射关系，导致混淆。

---

## 解决方案

### 设计原则

1. **核心规范**: 使用 snake_case（JSON transport 标准）作为规范名称
2. **绑定文档**: 遵循各自生态的命名约定，但**必须明确映射关系**
3. **字段映射表**: 每个绑定文档开头添加完整的字段映射表

---

## 具体修改

### 修改 1: EVM 绑定 - 新增"Field name mapping"章节

**位置**: `scheme_channel_evm.md` Line 17-33（在 "Goals and scope" 之后，"Identity and signatures" 之前）

**新增内容**:

```markdown
## Field name mapping

Transport JSON uses snake_case per x402 convention; on-chain EIP-712 structs use camelCase per Solidity convention. Implementations MUST map between these naming styles:

| JSON Field (Transport) | JSON Type        | EIP-712 Field (On-chain) | EIP-712 Type | Notes                       |
| ---------------------- | ---------------- | ------------------------ | ------------ | --------------------------- | --------------- |
| `channel_id`           | string (hex)     | `channelId`              | bytes32      | Parse hex string to bytes32 |
| `epoch`                | number           | string                   | `epoch`      | uint64                      | Parse to uint64 |
| `sub_channel_id`       | string (hex)     | `subChannelId`           | bytes32      | 32-byte identifier          |
| `accumulated_amount`   | string (decimal) | `accumulatedAmount`      | uint256      | Parse decimal string        |
| `nonce`                | number           | string                   | `nonce`      | uint64                      | Parse to uint64 |
| `payee_id`             | string (address) | `payee`                  | address      | Field name also changes     |

Additional notes:

- **chain_id**: Not in receipt (provided by EIP-712 domain separator as `chainId`)
- **asset**: Not in receipt (implicitly bound to `channelId`)
- **payer_signature**: EIP-712 signature bytes (0x-prefixed hex in transport)
```

**关键变化**:

1. ✅ 明确了 JSON (snake_case) ↔ Solidity (camelCase) 的映射
2. ✅ 说明了类型转换规则（string → bytes32, uint256 等）
3. ✅ 特别注明 `payee_id` → `payee` 的字段名变化
4. ✅ 解释了 `chain_id` 和 `asset` 为什么不在 receipt 中

### 修改 2: Rooch 绑定 - 完善"Receipt canonicalization and encoding"章节

**位置**: `scheme_channel_rooch.md` Line 28-72（替换原有简单列表）

**新增内容**:

#### A. 完整的字段映射表

```markdown
#### Complete field mapping (Move SubRAV ↔ JSON Transport)

| Move Field (SubRAV)  | Move Type | JSON Field (Transport) | JSON Type        | Notes                         |
| -------------------- | --------- | ---------------------- | ---------------- | ----------------------------- | ------------------------- |
| `version`            | u8        | `version`              | number           | Receipt version (currently 1) |
| `chain_id`           | u64       | `chain_id`             | number           | string                        | **Required** for Rooch    |
| `channel_id`         | ObjectID  | `channel_id`           | string (hex)     | Hex-encoded ObjectID          |
| `channel_epoch`      | u64       | `epoch`                | number           | string                        | Field name differs!       |
| `vm_id_fragment`     | String    | `sub_channel_id`       | string           | Field name differs!           |
| `accumulated_amount` | u256      | `accumulated_amount`   | string (decimal) | Decimal string for u256       |
| `nonce`              | u64       | `nonce`                | number           | string                        | Monotonic per sub-channel |
```

**关键变化**:

1. ✅ 完整列出所有 SubRAV 字段（之前完整，但格式简单）
2. ✅ 特别标注字段名不同的情况：`channel_epoch` → `epoch`, `vm_id_fragment` → `sub_channel_id`
3. ✅ 说明了类型转换（u256 → decimal string）

#### B. 新增"Fields NOT in SubRAV"表

```markdown
#### Fields NOT in SubRAV (handled separately)

| JSON Field (Transport) | Purpose                     | Where it's used                            |
| ---------------------- | --------------------------- | ------------------------------------------ |
| `payerKey`             | DID key identifier          | Resolves verification method for signature |
| `payee_id`             | Payee DID or address        | Compared against channel's `receiver`      |
| `payer_signature`      | Hex-encoded signature bytes | Verified against BCS-encoded SubRAV        |
```

**关键变化**:

1. ✅ **解决了 Issue #18**：补全了缺失的字段说明（payerKey, payee_id, payer_signature）
2. ✅ 明确说明这些字段不是 SubRAV 结构的一部分，而是在其他地方处理

#### C. 新增"BCS encoding order"说明

```markdown
#### BCS encoding order

The SubRAV struct is encoded using BCS in the following field order:

​`move
struct SubRAV {
    version: u8,
    chain_id: u64,
    channel_id: ObjectID,
    channel_epoch: u64,
    vm_id_fragment: String,
    accumulated_amount: u256,
    nonce: u64,
}
​`

This order MUST be preserved for signature verification to succeed.
```

**关键变化**:

1. ✅ **解决了 Issue #19**：明确说明了 BCS 编码的字段顺序
2. ✅ 提供了 Move struct 定义作为参考
3. ✅ 强调顺序的重要性（MUST preserve）

---

## 术语统一的结果

### 现在的清晰映射

#### Transport JSON (所有绑定统一使用 snake_case)

```json
{
  "channel_id": "0xabc...",
  "epoch": 3,
  "sub_channel_id": "device-1",
  "accumulated_amount": "1234567890",
  "nonce": 42,
  "payee_id": "0xdef..."
}
```

#### EVM 绑定 (camelCase for Solidity)

```javascript
struct ChannelReceipt {
  bytes32 channelId;      // channel_id
  uint64 epoch;           // epoch (名称相同)
  bytes32 subChannelId;   // sub_channel_id
  uint256 accumulatedAmount; // accumulated_amount
  uint64 nonce;           // nonce (名称相同)
  address payee;          // payee_id (字段名和类型都变)
}
```

#### Rooch 绑定 (snake_case, 但字段名有差异)

```move
struct SubRAV {
  version: u8,
  chain_id: u64,          // chain_id (相同)
  channel_id: ObjectID,   // channel_id (相同)
  channel_epoch: u64,     // epoch (Move 中叫 channel_epoch)
  vm_id_fragment: String, // sub_channel_id (Move 中叫 vm_id_fragment)
  accumulated_amount: u256, // accumulated_amount (相同)
  nonce: u64,             // nonce (相同)
}
```

---

## 影响分析

### 对开发者的好处

1. ✅ **清晰的参考**: 不再需要猜测字段名如何对应
2. ✅ **减少错误**: 映射表降低了实现错误的可能性
3. ✅ **类型转换指导**: 明确了如何在不同表示之间转换（hex string ↔ bytes32）

### 对互操作性的改进

1. ✅ **统一的 JSON**: 所有绑定的 transport payload 使用统一的 snake_case
2. ✅ **明确的差异**: 清楚说明了链特定字段名的差异（如 `vm_id_fragment`）
3. ✅ **类型兼容性**: 说明了如何处理大整数（string for u256/u64）

### 解决的额外问题

- ✅ **Issue #11** (EVM 字段映射不明确): 通过新增映射表完全解决
- ✅ **Issue #18** (Rooch 字段映射不完整): 补全了所有字段包括非 SubRAV 字段
- ✅ **Issue #19** (BCS 编码顺序未说明): 添加了 Move struct 定义和顺序说明
- ✅ **Issue #22** 部分解决: 通过映射表明确了字段格式（但 `ch_` 前缀问题需单独处理）

---

## 剩余工作

虽然 Issue #23 已基本解决，但还有一些相关的小问题：

### 1. Issue #22: channel_id 格式不一致

**问题**: Rooch 示例中使用 `"channel_id": "ch_0xabc..."`，但映射表说是 "hex string"

**建议**:

- 选项 A: 统一使用纯 hex `"0xabc..."`
- 选项 B: 明确定义 `ch_` 前缀的语义

### 2. 占位符风格统一（Issue #24）

**当前状态**:

- 核心规范: `"0x..."`, `"ch_0xabc..."`
- EVM: `"0xabcd..."`, `"0x9f..."`
- Rooch: `"ch_0xabc..."`, `"did:rooch:0x...#key-1"`

**建议**: 统一为 `0xabc...def` 格式（显示头尾）

---

## 文件变更清单

| 文件                      | 新增行数 | 主要变更                        |
| ------------------------- | -------- | ------------------------------- |
| `scheme_channel_evm.md`   | +17 行   | 新增 "Field name mapping" 章节  |
| `scheme_channel_rooch.md` | +45 行   | 完善字段映射，新增 BCS 编码说明 |

**总计**: ~62 行新增，2 个文件

---

## 验证清单

- [x] EVM 绑定有完整的字段映射表
- [x] Rooch 绑定有完整的字段映射表（包括非 SubRAV 字段）
- [x] 两个绑定都明确说明了与 JSON transport 的映射关系
- [x] BCS 编码顺序已说明（解决 Issue #19）
- [x] 类型转换规则已说明
- [x] 字段名差异已特别标注（epoch/channel_epoch, sub_channel_id/vm_id_fragment）
- [ ] 占位符格式仍需统一（Issue #24 待处理）
- [ ] channel_id 前缀问题仍需决策（Issue #22 部分待处理）

---

**修改完成日期**: 2025-10-27  
**下一步**: 可以继续解决剩余的 Critical/Important issues，或者处理 Issue #22 和 #24（占位符统一）
