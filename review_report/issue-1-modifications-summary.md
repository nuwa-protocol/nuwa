# Issue #1 修改总结

**修改日期**: 2025-10-27  
**修改依据**: `review_report/issue-1-final-decision.md`

---

## 核心决策

根据对 Rooch 实现代码的分析和 x402 exact scheme 的设计模式，确定了以下核心设计：

1. ✅ **Channel 与 Asset 强绑定**: 每个 channel 对应唯一的 `(payer, payee, asset)` 三元组
2. ❌ **asset 字段不在 receipt 中**: 因为它隐含在 `channel_id` 中
3. ✅ **chain_id 字段可选**: Rooch 需要（in-band），EVM 通过 domain 处理（out-of-band）

---

## 已完成的修改

### 1. 核心规范 (scheme_channel.md)

#### 修改 1.1: Concepts 章节 (Line 9-17)

**修改内容**:

- 明确说明 Channel 与单一资产强绑定
- 补充说明 `channel_id` 唯一标识 `(payer, payee, asset)` 三元组
- 说明多资产场景需要开多个 channel
- 强调设计提供类型安全和简化验证

**关键变化**:

```markdown
- **Channel**: A unidirectional payer-to-payee relation for **one specific asset**.
  - Each channel is bound to a specific asset type at creation time.
  - The asset type is part of the channel identity: `channel_id` uniquely represents the `(payer, payee, asset)` tuple.
  - To use multiple assets between the same payer-payee pair, open separate channels for each asset.
  - This design provides strong type safety and simplifies verification by preventing asset confusion.
```

#### 修改 1.2: Receipt 字段定义 (Line 23-34)

**修改内容**:

- `channel_id`: 明确说明它唯一标识 `(payer, payee, asset)` 三元组，asset 不单独包含
- `epoch`: 类型改为 `(number|string)` 以支持大整数
- `sub_channel_id`: 保留 `vm_id_fragment` 的别名说明
- `accumulated_amount`: 明确说明是"channel's asset type"的金额
- **新增** `chain_id`: 作为可选字段，说明 in-band vs out-of-band 域分离

**关键变化**:

```markdown
- `channel_id` (string): Identifier of the payment channel. The channel ID uniquely identifies
  the `(payer, payee, asset)` tuple. **The asset type is NOT included separately in the receipt**
  because it is implicitly bound to the `channel_id`.

- `chain_id` (string|number, optional): Network/chain identifier for cross-chain replay protection.
  Required for bindings using in-band domain separation (e.g., Rooch BCS encoding). Not required
  for bindings using out-of-band domain separation (e.g., EVM EIP-712 domain separator).
```

#### 修改 1.3: Security considerations (Line 181-189)

**修改内容**:

- 重新组织和扩展安全考量
- **新增** "Cross-chain replay" 说明
- **新增** "Asset binding" 说明
- 强调不同绑定的域分离机制

**关键变化**:

```markdown
- **Cross-chain replay**: Bindings MUST incorporate network/chain identifiers in the signature scope.
  Bindings using in-band domain separation (e.g., Rooch) MUST include `chain_id` in the signed receipt.
  Bindings using out-of-band domain separation (e.g., EVM EIP-712) MUST include network identifier in
  the signature domain (e.g., `domain.chainId`).

- **Asset binding**: The asset type is implicitly bound to the `channel_id` and does not need to be
  included in the receipt. Verifiers MUST ensure that the channel's asset type matches
  `PaymentRequirements.asset` by querying the channel state.
```

---

### 2. EVM 绑定 (scheme_channel_evm.md)

#### 修改 2.1: EIP-712 typed data (Line 32-69)

**修改内容**:

- 从 typed data 中**移除** `asset` 字段（原 Line 55）
- 扩展 domain 说明，强调 chainId 提供跨链保护
- 新增详细的 Notes 说明为什么不需要 asset
- 新增 `channelId` 计算公式
- 补充 validity window 的默认值说明

**关键变化**:

```javascript
const types = {
  ChannelReceipt: [
    { name: 'channelId', type: 'bytes32' },
    { name: 'epoch', type: 'uint64' },
    { name: 'subChannelId', type: 'bytes32' },
    { name: 'accumulatedAmount', type: 'uint256' },
    { name: 'nonce', type: 'uint64' },
    { name: 'payee', type: 'address' },
    // Note: asset is NOT included - it is implicitly bound to channelId
    { name: 'validAfter', type: 'uint256' },
    { name: 'validBefore', type: 'uint256' },
  ],
};
```

**新增 Notes**:

```markdown
- **Asset binding**: The `asset` type is **NOT included** in the typed data because it is implicitly
  bound to the `channelId`. Each `channelId` uniquely represents a `(payer, payee, asset)` tuple.
- **channelId calculation**: `channelId = keccak256(abi.encode(payer, payee, asset))`. This ensures
  asset type safety at the channel identity level.
- **Cross-chain protection**: The `chainId` in the EIP-712 domain separator provides cross-chain
  replay protection (out-of-band domain separation).
```

#### 修改 2.2: Settlement entrypoints (Line 87-96)

**修改内容**:

- 明确说明 asset 从 channel state 中获取
- 更新验证逻辑说明

**关键变化**:

```solidity
- Verify the channel exists and check `r.payee == channel.payee`, `channel.asset` (stored in channel state),
  and `channel.epoch == r.epoch`.
```

#### 修改 2.3: X-PAYMENT payload 示例 (Line 174-197)

**修改内容**:

- 添加 Note 说明 `channel_id` 隐式包含 asset

**关键变化**:

```markdown
Note: The `channel_id` uniquely identifies the `(payer, payee, asset)` tuple. The asset type is not
repeated in the receipt because it is implicitly bound to the `channel_id`.
```

---

### 3. Rooch 绑定 (scheme_channel_rooch.md)

#### 修改 3.1: 新增 "Asset binding" 章节 (Line 44-58)

**修改内容**:

- 新增完整的 "Asset binding (Rooch-specific)" 章节
- 详细说明 Rooch 的强绑定模型
- 解释为什么 SubRAV 不包含 `coin_type` 字段
- 列出设计优势

**新增内容**:

```markdown
### Asset binding (Rooch-specific)

Rooch channels are **strongly bound to a single asset type** via the generic parameter `<CoinType>`:

- `open_channel<CoinType>(sender, receiver)` creates a channel for that specific `CoinType`
- The `coin_type` is part of the `ChannelKey`: `{ sender, receiver, coin_type }`
- `channel_id = object::custom_object_id<ChannelKey, PaymentChannel>(key)`
- **SubRAV does NOT include `coin_type` field** because it is implicitly bound to `channel_id`
- To pay with different assets, open separate channels for each asset type

This design provides:

- **Type safety** at the Move VM level (leveraging Move's generics)
- **Smaller SubRAV structures** (no redundant asset field, reducing signature size)
- **Simpler verification logic** (asset validated via `channel_id` lookup from channel state)
- **Prevention of asset confusion** (each `channel_id` uniquely represents one asset type)
```

---

## 修改影响分析

### 对实现的影响

#### 1. Rooch 实现

- ✅ **无需修改**: Rooch 的实现已经是强绑定模型，修改只是补充文档说明

#### 2. EVM 实现（提案阶段）

- ⚠️ **需要调整**: 如果已有草稿实现，需要：
  - 从 EIP-712 struct 中移除 `asset` 字段
  - 确保 `channelId` 计算包含 `asset`
  - 更新验证逻辑，从 channel state 读取 asset

#### 3. 客户端实现

- ✅ **简化**: Receipt 更小（无需 asset 字段），签名成本降低
- ⚠️ **注意**: 需要根据 `(payer, payee, asset)` 计算正确的 `channel_id`

#### 4. Facilitator 实现

- ⚠️ **验证逻辑**: 需要从 channel state 查询 asset 并与 PaymentRequirements.asset 比对
- ✅ **简化**: 无需从 receipt 中解析 asset

### 对互操作性的影响

- ✅ **统一模型**: 核心规范和两个绑定现在都明确采用强绑定模型
- ✅ **清晰的差异**: 明确说明了 in-band (Rooch) vs out-of-band (EVM) 域分离
- ✅ **减少混淆**: 明确 asset 不在 receipt 中，避免不同实现的不一致

---

## 设计理由总结

### 为什么 channel 与 asset 强绑定？

1. **类型安全**: `channel_id` 天然防止资产混淆
2. **简化实现**: 验证时只需检查 `channel_id`，无需额外的 asset 验证
3. **Gas 优化**: Receipt 更小（无 asset 字段），签名和验证更便宜
4. **与 exact 一致**: EIP-3009 也是每个签名绑定到特定 ERC20 合约
5. **Rooch 已验证**: 生产环境运行，证明设计可行

### 为什么 asset 不在 receipt 中？

1. **隐式绑定**: `channel_id = hash(payer, payee, asset)`，已经包含 asset 信息
2. **避免冗余**: Asset 重复会增加签名大小和验证复杂度
3. **防御性保护**: 通过 channel state 验证提供第二层保护

### 为什么 chain_id 是可选的？

1. **域分离机制不同**:
   - Rooch: 需要显式包含（in-band）
   - EVM: 通过 EIP-712 domain 处理（out-of-band）
2. **灵活性**: 允许不同绑定使用最适合的方式
3. **向后兼容**: 不破坏 EVM 的现有 EIP-712 模式

---

## 与 exact scheme 的对比

| 方面               | exact (EIP-3009)                | channel (强绑定)                                   |
| ------------------ | ------------------------------- | -------------------------------------------------- |
| **资产绑定**       | 通过 `domain.verifyingContract` | 通过 `channel_id` 计算                             |
| **签名中的 asset** | 不在 message，在 domain         | 不在 receipt，在 channel_id                        |
| **跨链保护**       | `domain.chainId`                | Rooch: `receipt.chain_id`<br>EVM: `domain.chainId` |
| **一对多资产**     | 每种资产需要新签名              | 每种资产需要新 channel                             |
| **设计哲学**       | ✅ 强绑定（一个签名=一个ERC20） | ✅ 强绑定（一个channel=一个asset）                 |

**结论**: **channel 继承了 exact 的强绑定哲学，只是实现机制不同**。

---

## 后续工作

### 文档层面

- [ ] 更新 PR 描述，反映强绑定模型
- [ ] 补充多资产使用场景的最佳实践
- [ ] 添加 `channel_id` 计算的示例代码（各语言）

### 实现层面

- [ ] EVM 实现需要按新规范开发（当前只是提案）
- [ ] 客户端 SDK 需要提供 `channel_id` 计算工具函数
- [ ] Facilitator 需要实现 channel state 查询和 asset 验证

### 测试层面

- [ ] 添加跨 channel 的资产隔离测试
- [ ] 添加 `channel_id` 计算的向量测试
- [ ] 验证多资产场景的 UX

---

## 文件变更清单

| 文件                      | 修改行数 | 主要变更                                      |
| ------------------------- | -------- | --------------------------------------------- |
| `scheme_channel.md`       | ~30      | 3处修改：Concepts、Receipt 字段、Security     |
| `scheme_channel_evm.md`   | ~40      | 3处修改：EIP-712 typed data、Settlement、示例 |
| `scheme_channel_rooch.md` | ~15      | 1处新增：Asset binding 章节                   |

**总计**: ~85 行修改，3 个文件

---

## 验证清单

- [x] 核心规范明确说明强绑定模型
- [x] Receipt 字段定义包含 `chain_id`（可选）
- [x] Receipt 字段定义明确说明不包含 `asset`
- [x] Security considerations 包含跨链重放和资产绑定说明
- [x] EVM typed data 移除 `asset` 字段
- [x] EVM 文档补充 `channelId` 计算说明
- [x] Rooch 文档补充强绑定模型说明
- [x] 三个文档的设计哲学一致

---

**修改完成日期**: 2025-10-27  
**修改人**: AI Assistant  
**下一步**: 等待 review 反馈，准备解决其他 issues
