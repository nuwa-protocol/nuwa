# 移除时间边界字段总结

**日期**: 2025-10-27  
**决策**: 移除 EVM 绑定中的 `validAfter`/`validBefore` 字段

---

## 背景

在 Issue #4 & #29 的重新评估中，我们确认：

1. ✅ Nonce 单调性已提供足够的重放保护
2. ✅ Epoch 机制提供了失效能力
3. ✅ 时间窗口不是安全必需的

**用户观点**: 既然时间边界不是必需的，那么在 EVM 上也不需要 `validAfter` 和 `validBefore` 字段了。

**结论**: 完全正确！移除这些字段可以简化协议设计。

---

## 修改内容

### 1. ✅ 简化了 EVM EIP-712 Typed Data

**修改前**（8 个字段）:

```js
const types = {
  ChannelReceipt: [
    { name: 'channelId', type: 'bytes32' },
    { name: 'epoch', type: 'uint64' },
    { name: 'subChannelId', type: 'bytes32' },
    { name: 'accumulatedAmount', type: 'uint256' },
    { name: 'nonce', type: 'uint64' },
    { name: 'payee', type: 'address' },
    { name: 'validAfter', type: 'uint256' }, // ← 移除
    { name: 'validBefore', type: 'uint256' }, // ← 移除
  ],
};
```

**修改后**（6 个字段）:

```js
const types = {
  ChannelReceipt: [
    { name: 'channelId', type: 'bytes32' },
    { name: 'epoch', type: 'uint64' },
    { name: 'subChannelId', type: 'bytes32' },
    { name: 'accumulatedAmount', type: 'uint256' },
    { name: 'nonce', type: 'uint64' },
    { name: 'payee', type: 'address' },
  ],
};
```

**改进**：

- ✅ 减少了 2 个字段（25% 减少）
- ✅ 更简洁的签名数据
- ✅ 降低 gas 成本（更少的数据需要 hash）
- ✅ 减少实现复杂度

---

### 2. ✅ 更新了 EVM 绑定的注释

**添加了明确说明**:

```markdown
- **No time bounds**: Time validity windows (e.g., `validAfter`/`validBefore`)
  are **NOT included**. The `nonce` strictly increasing constraint and `epoch`
  mechanism provide sufficient protection against replay and stale receipts
  without requiring time-based expiration.
```

---

### 3. ✅ 简化了核心规范的安全考量

**修改前**:

```markdown
- **Time-bounds (optional)**: Bindings MAY implement time validity windows
  (e.g., `validAfter`/`validBefore` in EVM) for convenience, allowing receipts
  to expire automatically. However, time bounds are not required for security...
```

**修改后**:
完全移除了 Time-bounds 条目

**理由**: 既然不需要，就不要提及，避免混淆。

---

## 影响分析

### ✅ 正面影响

1. **更简洁的协议设计**
   - 减少了不必要的字段
   - 降低了概念复杂度

2. **更低的实现成本**
   - 无需处理时间窗口验证
   - 无需处理时间同步问题
   - 无需处理默认值（0 和 MAX）

3. **更低的 Gas 成本**
   - EIP-712 hash 计算更少的字段
   - 链上存储更少的数据

4. **更清晰的安全模型**
   - 只依赖 Nonce + Epoch
   - 无需考虑时钟偏差
   - 无需考虑时区问题

### ✅ 无负面影响

1. **安全性**: 无影响（本来就不需要）
2. **功能性**: 无影响（没有损失必要功能）
3. **兼容性**:
   - Rooch 实现：无影响（本来就没有时间字段）
   - EVM 提案：更新了设计，还未有生产实现

---

## 设计理念

### 遵循 KISS 原则（Keep It Simple, Stupid）

**之前的设计思路**:

- 从 EIP-3009 借鉴了 `validAfter`/`validBefore`
- 想要提供"额外的安全层"或"便利功能"

**问题**:

- 增加了复杂度
- 给人错误印象（好像时间窗口是必需的）
- 实际上 Nonce 机制已经足够

**现在的设计思路**:

- ✅ 只包含必需的安全机制
- ✅ 让协议尽可能简单
- ✅ 避免过度设计

### 类比：Bitcoin UTXO

**Bitcoin 的设计**:

- UTXO 一旦被花费，就自动失效
- 不需要时间戳或过期时间
- 双花由 blockchain 顺序解决

**Channel Scheme 的设计**:

- Receipt 一旦被 claim（更高 nonce），旧的自动失效
- 不需要时间戳或过期时间
- 重放由 nonce 单调性解决

---

## 与其他协议对比

### EIP-3009 (TransferWithAuthorization)

**EIP-3009 有时间字段的原因**:

- 一次性授权（不是累积的）
- 需要限制授权的有效期
- 防止长期有效的授权被滥用

**Channel Scheme 不需要的原因**:

- 累积式授权（每次都是更大的金额）
- Nonce 单调性自动失效旧授权
- Payer 可以通过 close channel（epoch++）主动失效

### Lightning Network

**Lightning Network**:

- 也使用 sequence number（类似我们的 nonce）
- 也不依赖时间戳
- 最新的 commitment transaction 自动替代旧的

**设计理念相同**: 顺序 > 时间

---

## 实现指南更新

### 对 EVM 实现者

**之前需要**:

```solidity
require(block.timestamp >= r.validAfter, "not yet valid");
require(block.timestamp <= r.validBefore, "expired");
```

**现在无需**:

- ❌ 无需时间检查
- ✅ 只需 nonce 检查：`require(r.nonce > lastNonce)`

### 对客户端实现者

**之前需要**:

```typescript
const receipt = {
  // ...
  validAfter: Math.floor(Date.now() / 1000),
  validBefore: Math.floor(Date.now() / 1000) + 300, // 5 minutes
};
```

**现在无需**:

- ❌ 无需设置时间字段
- ✅ 更简单的 receipt 构造

---

## 业务场景考虑

### 问题：如果真的需要"限时优惠"怎么办？

**回答**: 在应用层处理

**方案 1 - 链下检查**:

```typescript
// Facilitator 在 verify 时检查
if (Date.now() > offerExpiration) {
  return { isValid: false, reason: 'offer expired' };
}
```

**方案 2 - 业务逻辑**:

```solidity
// Contract 中特定的优惠逻辑
if (block.timestamp > campaign.endTime) {
  // Apply regular price instead of discounted price
}
```

**方案 3 - 关闭 channel**:

```solidity
// 优惠结束时，服务方可以要求关闭旧 channel，开新 channel
```

**关键点**:

- ✅ 业务逻辑与安全机制分离
- ✅ 协议层保持简洁
- ✅ 应用层灵活实现业务需求

---

## 文档更新清单

- [x] 移除 EVM EIP-712 struct 中的 `validAfter`/`validBefore`
- [x] 更新 EVM 绑定的注释，说明"No time bounds"
- [x] 移除核心规范中的"Time-bounds (optional)"说明
- [x] 保留"Replay protection"说明中关于 nonce 机制的详细解释

---

## 相关讨论和文档

1. **Issue #4 & #29 重新评估**: `issue-4-29-reevaluation.md`
2. **Issue #4 & #29 解决**: `issue-4-29-resolution.md`
3. **本文档**: 移除时间边界字段的最终决策

---

## 结论

✅ **移除 `validAfter`/`validBefore` 是正确的决策**

**收益**:

1. 更简洁的协议（-25% 字段）
2. 更低的实现复杂度
3. 更低的 gas 成本
4. 更清晰的安全模型

**无损失**:

1. 安全性依然完整（Nonce + Epoch）
2. 功能性无减少（业务逻辑可在应用层实现）
3. 兼容性无影响（EVM 还是提案阶段）

**设计理念**:

> "Perfection is achieved, not when there is nothing more to add, but when there is nothing left to take away." - Antoine de Saint-Exupéry

---

**完成日期**: 2025-10-27  
**感谢用户的洞察，让协议更加优雅！** 🎉
