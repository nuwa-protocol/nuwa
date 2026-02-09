# Issue #5 解决总结 - 验证步骤缺少初始状态检查

**Issue ID**: #5  
**优先级**: 中  
**状态**: ✅ 已完成  
**完成日期**: 2025-10-27

---

## 问题描述

### 原始问题

在 `scheme_channel.md` 的验证流程中，步骤 3 "Accumulated delta and budget" 没有说明如何处理首次请求：

**修改前**:

```markdown
3. Accumulated delta and budget
   - Compute delta = `accumulatedAmount - last_confirmed_amount` for the sub-channel and validate that `0 <= delta <= paymentRequirements.maxAmountRequired`.
```

**问题**:

1. 首次请求时没有 `last_confirmed_amount`，如何计算 delta？
2. 首次 receipt 的 nonce 应该从多少开始？
3. 首次 receipt 的 `accumulatedAmount` 可以是 0 吗？

### 影响范围

**实现一致性问题**:

- 不同的实现者可能对首次状态有不同的假设
- 可能导致 facilitator 拒绝合法的首次 receipt
- 可能导致接受非法的 receipt（如 nonce=0）

**用户体验问题**:

- 首次使用 channel 时可能遇到验证失败
- 错误消息不明确（"invalid nonce" vs "first receipt should start from nonce 1"）

---

## 解决方案

### 修改内容

在 `deps/x402/specs/schemes/channel/scheme_channel.md` 的验证步骤 3 中添加明确说明：

**修改后**:

```markdown
3. Accumulated delta and budget
   - For the first receipt in a sub-channel, treat `lastConfirmedAmount` as 0 and `lastConfirmedNonce` as 0.
   - Compute delta = `accumulatedAmount - lastConfirmedAmount` for the sub-channel.
   - Validate that `0 <= delta <= paymentRequirements.maxAmountRequired`.
   - For first receipt: verify `nonce >= 1` and `accumulatedAmount >= 0`.
```

### 关键改进

#### 1. ✅ 明确初始状态

**添加**:

```markdown
- For the first receipt in a sub-channel, treat `lastConfirmedAmount` as 0 and `lastConfirmedNonce` as 0.
```

**收益**:

- 消除歧义：所有实现者都知道初始状态
- 统一行为：首次和后续 delta 计算使用相同公式
- 简化逻辑：无需特殊分支处理

#### 2. ✅ 拆分 delta 计算步骤

**之前**: 一行说明（compute 和 validate 混在一起）  
**现在**: 两行说明（分步骤）

```markdown
- Compute delta = `accumulatedAmount - lastConfirmedAmount` for the sub-channel.
- Validate that `0 <= delta <= paymentRequirements.maxAmountRequired`.
```

**收益**:

- 更清晰的逻辑流程
- 易于实现（先计算，后验证）

#### 3. ✅ 添加首次 receipt 的特殊验证

**添加**:

```markdown
- For first receipt: verify `nonce >= 1` and `accumulatedAmount >= 0`.
```

**收益**:

- 防止 nonce=0 的非法 receipt
- 确保 `accumulatedAmount` 非负
- 为实现者提供明确的检查清单

---

## 设计考量

### 为什么 lastConfirmedAmount 初始为 0？

**理由**:

1. **符合语义**: "confirmed amount" 为 0 表示还没有确认任何金额
2. **简化计算**: 首次 delta = `accumulatedAmount - 0 = accumulatedAmount`
3. **一致性**: 后续所有 delta 计算使用相同公式

**替代方案** (已拒绝):

- ❌ 使用 `null` 或 `undefined`: 需要特殊处理分支
- ❌ 使用 `-1`: 语义不清晰，可能导致负数计算错误

### 为什么 nonce 从 1 开始？

**理由**:

1. **防止混淆**: nonce=0 可能与"未初始化"混淆
2. **明确语义**: nonce >= 1 表示"已经有交易"
3. **传统惯例**: 许多区块链（如 Ethereum）的 nonce 也从 0 或 1 开始

**实现示例**:

```typescript
// EVM 实现
function claim(ChannelReceipt memory receipt) external {
  Channel storage channel = channels[receipt.channelId];
  uint64 lastNonce = channel.subChannels[receipt.subChannelId].lastNonce;

  // 对于首次 receipt，lastNonce = 0，要求 receipt.nonce >= 1
  require(receipt.nonce > lastNonce, "nonce must be strictly increasing");

  // ...
}
```

```move
// Rooch 实现
public entry fun claim_sub_rav(
    payer: &signer,
    sub_rav: SubRAV,
    // ...
) {
    let channel = table::borrow_mut(&mut hub.channels, channel_id);
    let last_nonce = if (table::contains(&channel.sub_channels, vm_id)) {
        table::borrow(&channel.sub_channels, vm_id).last_nonce
    } else {
        0  // 首次 sub-channel，last_nonce = 0
    };

    assert!(sub_rav.nonce > last_nonce, E_INVALID_NONCE);

    // ...
}
```

### 为什么允许 accumulatedAmount = 0？

**场景**: 某些服务可能允许"试用请求"，成本为 0

**理由**:

1. **灵活性**: 支持免费试用、免费层等业务模型
2. **一致性**: 首次 receipt 可以是 `{nonce: 1, accumulatedAmount: 0}`
3. **无安全风险**: delta = 0 符合预算约束

**示例**:

```json
{
  "receipt": {
    "channelId": "0xabc123...",
    "epoch": 1,
    "subChannelId": "device-1",
    "accumulatedAmount": "0", // 首次请求，免费试用
    "nonce": 1,
    "payeeId": "did:rooch:0x..."
  }
}
```

**下一个请求**:

```json
{
  "receipt": {
    "channelId": "0xabc123...",
    "epoch": 1,
    "subChannelId": "device-1",
    "accumulatedAmount": "1000000", // 第二次请求，开始收费
    "nonce": 2,
    "payeeId": "did:rooch:0x..."
  }
}
```

---

## 实现示例

### Facilitator 验证逻辑

```typescript
interface SubChannelState {
  lastConfirmedAmount: bigint;
  lastConfirmedNonce: number;
}

function verifyReceipt(
  receipt: ChannelReceipt,
  paymentRequirements: PaymentRequirements,
  subChannelState: SubChannelState | null
): { isValid: boolean; reason?: string } {
  // Step 3: Accumulated delta and budget
  const lastConfirmedAmount = subChannelState?.lastConfirmedAmount ?? 0n;
  const lastConfirmedNonce = subChannelState?.lastConfirmedNonce ?? 0;

  const accumulatedAmount = BigInt(receipt.accumulatedAmount);
  const nonce = receipt.nonce;

  // 验证 nonce 严格递增
  if (nonce <= lastConfirmedNonce) {
    return {
      isValid: false,
      reason: `Invalid nonce: ${nonce} (last confirmed: ${lastConfirmedNonce})`,
    };
  }

  // 首次 receipt 的额外检查
  if (lastConfirmedNonce === 0) {
    if (nonce < 1) {
      return {
        isValid: false,
        reason: 'First receipt must have nonce >= 1',
      };
    }
    if (accumulatedAmount < 0n) {
      return {
        isValid: false,
        reason: 'accumulatedAmount must be non-negative',
      };
    }
  }

  // 计算 delta
  const delta = accumulatedAmount - lastConfirmedAmount;

  // 验证预算
  const maxAmount = BigInt(paymentRequirements.maxAmountRequired);
  if (delta < 0n || delta > maxAmount) {
    return {
      isValid: false,
      reason: `Delta ${delta} out of bounds [0, ${maxAmount}]`,
    };
  }

  return { isValid: true };
}
```

### EVM 合约验证逻辑

```solidity
struct SubChannelState {
    uint256 lastConfirmedAmount;
    uint64 lastConfirmedNonce;
}

function claim(ChannelReceipt memory receipt) external {
    Channel storage channel = channels[receipt.channelId];
    SubChannelState storage subChannel = channel.subChannels[receipt.subChannelId];

    // 首次 sub-channel，lastConfirmedNonce = 0
    uint64 lastNonce = subChannel.lastConfirmedNonce;
    uint256 lastAmount = subChannel.lastConfirmedAmount;

    // Step 2: Replay protection - nonce 严格递增
    require(receipt.nonce > lastNonce, "nonce must be strictly increasing");

    // Step 3: Accumulated delta and budget
    // 注意：Solidity 0.8+ 会自动检查溢出，所以减法安全
    uint256 delta = receipt.accumulatedAmount - lastAmount;
    // delta >= 0 由 Solidity 类型系统保证（uint256）
    // 实际业务中可以添加 maxAmount 检查（如果需要）

    // 更新状态
    subChannel.lastConfirmedAmount = receipt.accumulatedAmount;
    subChannel.lastConfirmedNonce = receipt.nonce;

    // 转账
    channel.balance -= delta;
    payable(receipt.payee).transfer(delta);

    emit ReceiptClaimed(receipt.channelId, receipt.subChannelId, receipt.nonce, delta);
}
```

---

## 测试场景

### 测试用例 1: 首次 receipt (合法)

**输入**:

```json
{
  "channelId": "0xabc123...",
  "epoch": 1,
  "subChannelId": "device-1",
  "accumulatedAmount": "1000000",
  "nonce": 1,
  "payeeId": "did:rooch:0x..."
}
```

**状态**: `subChannelState = null` (首次)

**预期结果**:

- ✅ `lastConfirmedAmount` treated as 0
- ✅ `lastConfirmedNonce` treated as 0
- ✅ `delta = 1000000 - 0 = 1000000`
- ✅ `nonce = 1 > 0` ✓
- ✅ `accumulatedAmount = 1000000 >= 0` ✓
- ✅ 验证通过

---

### 测试用例 2: 首次 receipt (nonce=0，非法)

**输入**:

```json
{
  "channelId": "0xabc123...",
  "epoch": 1,
  "subChannelId": "device-1",
  "accumulatedAmount": "1000000",
  "nonce": 0, // ❌ 非法
  "payeeId": "did:rooch:0x..."
}
```

**状态**: `subChannelState = null` (首次)

**预期结果**:

- ❌ `nonce = 0` not > `lastConfirmedNonce = 0`
- ❌ 验证失败: "nonce must be strictly increasing" (or "First receipt must have nonce >= 1")

---

### 测试用例 3: 首次 receipt (amount=0，合法)

**输入**:

```json
{
  "channelId": "0xabc123...",
  "epoch": 1,
  "subChannelId": "device-1",
  "accumulatedAmount": "0", // 免费试用
  "nonce": 1,
  "payeeId": "did:rooch:0x..."
}
```

**状态**: `subChannelState = null` (首次)

**预期结果**:

- ✅ `delta = 0 - 0 = 0`
- ✅ `nonce = 1 > 0` ✓
- ✅ `accumulatedAmount = 0 >= 0` ✓
- ✅ `0 <= delta <= maxAmount` ✓
- ✅ 验证通过

---

### 测试用例 4: 第二次 receipt (合法)

**输入**:

```json
{
  "channelId": "0xabc123...",
  "epoch": 1,
  "subChannelId": "device-1",
  "accumulatedAmount": "2500000",
  "nonce": 2,
  "payeeId": "did:rooch:0x..."
}
```

**状态**:

```typescript
subChannelState = {
  lastConfirmedAmount: 1000000n,
  lastConfirmedNonce: 1,
};
```

**预期结果**:

- ✅ `delta = 2500000 - 1000000 = 1500000`
- ✅ `nonce = 2 > 1` ✓
- ✅ `1500000 <= maxAmount` ✓
- ✅ 验证通过

---

### 测试用例 5: Nonce 回退 (非法)

**输入**:

```json
{
  "channelId": "0xabc123...",
  "epoch": 1,
  "subChannelId": "device-1",
  "accumulatedAmount": "1000000",
  "nonce": 1, // ❌ 回退
  "payeeId": "did:rooch:0x..."
}
```

**状态**:

```typescript
subChannelState = {
  lastConfirmedAmount: 2500000n,
  lastConfirmedNonce: 2,
};
```

**预期结果**:

- ❌ `nonce = 1` not > `lastConfirmedNonce = 2`
- ❌ 验证失败: "Invalid nonce: 1 (last confirmed: 2)"

---

### 测试用例 6: Amount 回退 (非法)

**输入**:

```json
{
  "channelId": "0xabc123...",
  "epoch": 1,
  "subChannelId": "device-1",
  "accumulatedAmount": "1000000", // ❌ 小于上次
  "nonce": 3,
  "payeeId": "did:rooch:0x..."
}
```

**状态**:

```typescript
subChannelState = {
  lastConfirmedAmount: 2500000n,
  lastConfirmedNonce: 2,
};
```

**预期结果**:

- ❌ `delta = 1000000 - 2500000 = -1500000 < 0`
- ❌ 验证失败: "Delta -1500000 out of bounds [0, maxAmount]"

---

## 相关修改

### 修改的文件

1. **`deps/x402/specs/schemes/channel/scheme_channel.md`**
   - 更新验证步骤 3，添加初始状态处理说明

### 相关 Issues

- **Issue #6** - 首次请求和最后请求处理（部分重叠，需要进一步完善 handshake 章节）
- **Issue #32** - 状态管理细节（可以在 Implementation Guide 中扩展）

---

## 总结

### ✅ 解决的问题

1. **消除歧义**: 明确首次 receipt 的初始状态（lastConfirmedAmount=0, lastConfirmedNonce=0）
2. **统一行为**: 首次和后续请求使用相同的 delta 计算公式
3. **明确约束**: 首次 receipt 必须 nonce >= 1, accumulatedAmount >= 0
4. **实现指导**: 为实现者提供清晰的验证步骤

### ✅ 设计优点

1. **简单**: 无需特殊分支，统一处理逻辑
2. **安全**: 明确的 nonce 约束防止非法 receipt
3. **灵活**: 允许 accumulatedAmount=0，支持免费试用等场景
4. **一致**: 与 Nonce 单调性和 Epoch 机制协调一致

### 🎯 影响

- ✅ **实现一致性**: 所有实现者都遵循相同的初始状态约定
- ✅ **用户体验**: 首次使用 channel 时不会遇到意外的验证失败
- ✅ **文档完整性**: 验证流程更加完整和清晰

---

**完成日期**: 2025-10-27  
**状态**: ✅ 已完成并更新 `remaining-issues-analysis.md`
