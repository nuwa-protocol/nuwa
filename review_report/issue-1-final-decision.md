# Issue #1 最终决策：Channel 是否应与资产绑定？

## 核心问题

**channel 是否是和资产绑定的？** 这决定了 `asset` 字段是否应该在 receipt 中包含。

---

## Rooch 实现现状（实际证据）

### 1. SubRAV 结构（Rooch 实现）

从 `deps/rooch/crates/rooch-types/src/framework/payment_channel.rs` Line 32-42：

```rust
/// SubRAV data structure for BCS serialization
#[derive(Serialize, Deserialize)]
pub struct SubRAV {
    pub version: u8,
    pub chain_id: u64,
    pub channel_id: ObjectID,
    pub channel_epoch: u64,
    pub vm_id_fragment: String,
    pub amount: U256,
    pub nonce: u64,
}
```

**关键发现**：✅ **Rooch SubRAV 中 NO asset/coin_type 字段**

### 2. PaymentChannel 结构（Rooch 链上状态）

从 `deps/rooch/frameworks/rooch-framework/sources/payment_channel.move` Line 184-192：

```move
struct PaymentChannel has key {
    sender: address,
    receiver: address,
    coin_type: String,              // ✅ Channel 存储了 coin_type
    sub_channels: Table<String, SubChannel>,
    status: u8,
    channel_epoch: u64,
    cancellation_info: Option<CancellationInfo>,
}
```

**关键发现**：✅ **Channel 与 coin_type 强绑定**

### 3. open_channel 函数（泛型参数）

从 `deps/rooch/frameworks/rooch-framework/sources/payment_channel.move` Line 368-376：

```move
public fun open_channel<CoinType: key + store>(
    channel_sender: &signer,
    channel_receiver: address,
) : ObjectID {
    let sender_addr = signer::address_of(channel_sender);
    assert!(sender_addr != channel_receiver, ErrorNotReceiver);
    assert!(did::exists_did_for_address(sender_addr), ErrorSenderMustIsDID);
    let coin_type = type_info::type_name<CoinType>();     // ✅ 从泛型获取 coin_type
    let channel_id = calc_channel_object_id(sender_addr, channel_receiver, coin_type);
    ...
```

**关键发现**：✅ **Channel 创建时通过泛型参数 `<CoinType>` 确定唯一资产类型**

### 4. ChannelKey 结构（Channel ID 计算）

从 `deps/rooch/crates/rooch-types/src/framework/payment_channel.rs` Line 23-30：

```rust
/// Key structure for identifying a unidirectional payment channel
struct ChannelKey {
    sender: AccountAddress,
    receiver: AccountAddress,
    coin_type: String,              // ✅ coin_type 是 channel ID 的一部分
}
```

从 Line 409-425：

```rust
pub fn calc_channel_object_id(
    coin_type: &StructTag,
    sender: AccountAddress,
    receiver: AccountAddress,
) -> ObjectID {
    let key = ChannelKey {
        sender,
        receiver,
        coin_type: coin_type.to_canonical_string(),
    };

    let channel_struct_tag = PaymentChannel::struct_tag();
    custom_object_id(&key, &channel_struct_tag)
}
```

**关键发现**：✅ **coin_type 是 Channel ID 的组成部分，不同资产会产生不同的 channel ID**

### 5. claim_from_channel 验证（链上验证）

从 `deps/rooch/frameworks/rooch-framework/sources/payment_channel.move` Line 615-623：

```move
let sub_rav = SubRAV {
    version: SUB_RAV_VERSION_V1,
    chain_id: chain_id::chain_id(),
    channel_id,                          // ✅ channel_id 隐式包含 coin_type
    channel_epoch: channel.channel_epoch,
    vm_id_fragment: sender_vm_id_fragment,
    accumulated_amount: sub_accumulated_amount,
    nonce: sub_nonce,
};
```

**关键发现**：✅ **验证时通过 channel_id 间接验证 coin_type，无需在 SubRAV 中重复**

---

## 设计哲学分析

### Rooch 设计：Channel = (Sender, Receiver, CoinType) 三元组

```
channel_id = hash(ChannelKey { sender, receiver, coin_type })
             ↓
一个三元组 (Alice, Bob, USDC) 对应一个唯一的 channel
             ↓
如果 Alice 想用 ETH 支付 Bob，需要开另一个 channel
```

**优势**：

1. ✅ **强类型安全**：Channel ID 本身就绑定了资产类型
2. ✅ **防止资产混淆**：不同资产的 channel 物理隔离
3. ✅ **简化验证**：只需验证 channel_id，无需额外检查 asset
4. ✅ **Gas 优化**：SubRAV 更小（无需 asset 字段），签名和验证更便宜

**代价**：

1. ⚠️ **多资产需要多 channel**：如果用户需要用多种资产支付同一个服务商，需要开多个 channel
2. ⚠️ **Hub 余额管理**：PaymentHub 需要按 coin_type 管理 active_channels 计数

### EVM 设计提案（待讨论）：Asset 是否应该显式包含？

从 `scheme_channel_evm.md` Line 54-55：

```javascript
const types = {
  ChannelReceipt: [
    { name: 'channelId', type: 'bytes32' },
    { name: 'epoch', type: 'uint64' },
    { name: 'subChannelId', type: 'bytes32' },
    { name: 'accumulatedAmount', type: 'uint256' },
    { name: 'nonce', type: 'uint64' },
    { name: 'payee', type: 'address' },
    { name: 'asset', type: 'address' }, // ⚠️ EVM 提案包含 asset
    { name: 'validAfter', type: 'uint256' },
    { name: 'validBefore', type: 'uint256' },
  ],
};
```

**为什么 EVM 提案包含 asset？**

1. **EVM 没有 Move 的泛型**：Solidity 合约不能像 Move 那样用泛型参数确定类型
2. **潜在的灵活性**：可能考虑一个 channel 支持多种资产？
3. **防御性编程**：签名显式覆盖 asset，即使 channel state 被攻击也有第二层保护

**但这引发了设计问题**：

```
方案 A (Rooch 模式)：channel_id = hash(payer, payee, asset)
   - 一个 channel 绑定一种资产
   - asset 隐式在 channel_id 中
   - SubRAV 不需要 asset 字段

方案 B (多资产 channel)：channel_id = hash(payer, payee)
   - 一个 channel 可以支持多种资产
   - SubRAV 必须包含 asset 字段
   - 更灵活但更复杂
```

---

## 设计决策：Channel 应该与资产绑定吗？

### 选项 1：强绑定（Rooch 模式）✅ 推荐

**定义**：一个 channel 对应一个唯一资产类型

**实现**：

- `channel_id = hash(sender, receiver, asset)`
- SubRAV/Receipt 中 **不包含** asset 字段
- 不同资产需要开不同 channel

**优点**：

1. ✅ **类型安全**：Channel ID 天然防止资产混淆
2. ✅ **实现简单**：验证时只需检查 channel_id
3. ✅ **Gas 优化**：签名更小，验证更便宜
4. ✅ **与 Rooch 已有实现一致**
5. ✅ **清晰的生命周期**：每个 channel 独立管理一种资产的授权和余额

**缺点**：

1. ⚠️ **多资产场景**：用户需要为每种资产开一个 channel
2. ⚠️ **Hub 管理复杂度**：需要跟踪每种资产的 active channels

**适用场景**：

- 长期的支付关系（如订阅服务）
- 单一资产的高频交易（如 LLM token 计费）
- 需要最优 Gas 效率的场景

### 选项 2：弱绑定（多资产 channel）

**定义**：一个 channel 可以处理多种资产

**实现**：

- `channel_id = hash(sender, receiver)` （不包含 asset）
- SubRAV/Receipt 中 **必须包含** asset 字段
- 同一 channel 可用于不同资产

**优点**：

1. ✅ **灵活性**：一个 channel 支付多种资产
2. ✅ **用户体验**：不需要为每种资产开 channel

**缺点**：

1. ❌ **复杂性大幅增加**：
   - 需要在 receipt 中包含 asset
   - 验证逻辑更复杂（检查 asset 有效性）
   - 链上状态管理复杂（每种资产的余额、nonce 分开管理？）
2. ❌ **Gas 成本更高**：签名更大，验证更贵
3. ❌ **安全性降低**：asset 选择错误的攻击面增大
4. ❌ **与 Hub 模型冲突**：Rooch 的 Hub 按 coin_type 管理 active_channels，多资产 channel 会破坏这个模型

**适用场景**：

- 短期的临时支付（但这种场景不适合 channel 模式）
- 需要动态切换资产的场景（但切换频繁的话 channel 优势不明显）

---

## 推荐方案

### 核心规范修改

**结论**：✅ **channel 应该与资产强绑定** （采用 Rooch 模式）

在 `scheme_channel.md` 的 **Concepts** 章节（Line 9-13）补充：

```markdown
## Concepts: Channel, Sub-channel, Epoch

- **Channel**: A unidirectional payer-to-payee relation for **one asset**. Identified by `channel_id`.
  - Each channel is bound to a specific asset type at creation time
  - The asset type is part of the channel identity: `channel_id = hash(payer, payee, asset)`
  - To use multiple assets between the same payer-payee pair, open separate channels
  - This design provides strong type safety and simplifies verification
- **Sub-channel** (`sub_channel_id`): A logical concurrent stream under the same channel...
- **Epoch**: Increments when a channel is closed and reopened...
```

在 **receipt** 字段定义中：

```markdown
- `receipt` (object): Channel receipt (signed data) with fields:
  - `channel_id` (string): Identifier of the payment channel. The channel ID uniquely identifies
    the (payer, payee, asset) tuple. **Asset type is NOT included separately in the receipt**
    because it is implicitly bound to the channel_id.
  - `epoch` (number): Channel epoch...
  - `sub_channel_id` (string): Logical stream identifier...
  - `accumulated_amount` (string): Total accumulated amount in **the channel's asset type** (base units)...
  - `nonce` (number|string): Monotonic per sub-channel...
  - `payee_id` (string): Identifier of the payee...
  - `chain_id` (string|number, optional): Network/chain identifier for cross-chain replay protection.
    Required for bindings using in-band domain separation (e.g., Rooch). Not required for bindings
    using out-of-band domain separation (e.g., EVM EIP-712).
  - `payer_signature` (string): Signature over the canonical receipt body, per binding.
```

### EVM 绑定需要重新设计

**当前 EVM 提案的问题**：

1. ❌ Line 54-55 的 EIP-712 typed data 包含 `asset` 字段，与强绑定模型冲突
2. ❌ 没有说明 channel_id 如何计算（是否包含 asset）
3. ❌ Hub 模型（Line 108-143）描述中没有明确 channel 是否按资产隔离

**推荐修改**：

1. **明确 channel_id 包含 asset**：

```solidity
// Channel ID 计算（类似 Rooch 的 ChannelKey）
function calcChannelId(
    address payer,
    address payee,
    address asset
) public pure returns (bytes32) {
    return keccak256(abi.encode(payer, payee, asset));
}
```

2. **从 EIP-712 typed data 中移除 asset**：

```javascript
const types = {
  ChannelReceipt: [
    { name: 'channelId', type: 'bytes32' }, // ✅ 已包含 asset
    { name: 'epoch', type: 'uint64' },
    { name: 'subChannelId', type: 'bytes32' },
    { name: 'accumulatedAmount', type: 'uint256' },
    { name: 'nonce', type: 'uint64' },
    { name: 'payee', type: 'address' },
    // ❌ 移除：{ name: "asset", type: "address" },
    { name: 'validAfter', type: 'uint256' },
    { name: 'validBefore', type: 'uint256' },
  ],
};
```

3. **更新 Channel 结构**：

```solidity
struct Channel {
    address payer;
    address payee;
    address asset;            // ✅ Channel 绑定资产
    uint64 epoch;
    uint256 lockedBalance;    // Model A
}
```

4. **更新 Hub 模型**：

```solidity
interface IPaymentHub {
    // 按资产分别管理
    function available(address payer, address asset) external view returns (uint256);

    // 每个 channel 都关联特定资产
    function onChannelOpened(address payer, address payee, address asset) external;
    function onChannelClosed(address payer, address payee, address asset) external;
}
```

### Rooch 绑定保持不变

Rooch 的实现已经是强绑定模型，无需修改。只需在文档中补充说明：

```markdown
## Asset binding (Rooch-specific)

Rooch channels are strongly bound to a single asset type via the generic parameter `<CoinType>`:

- `open_channel<CoinType>(sender, receiver)` creates a channel for that specific CoinType
- The `coin_type` is part of the ChannelKey: `{ sender, receiver, coin_type }`
- `channel_id = object::custom_object_id<ChannelKey, PaymentChannel>(key)`
- SubRAV does NOT include coin_type field because it is implicitly bound to channel_id
- To pay with different assets, open separate channels

This design provides:

- Type safety at the VM level (Move's generics)
- Smaller SubRAV structures (no redundant asset field)
- Simpler verification logic (asset validated via channel_id lookup)
```

---

## 对比：exact scheme 的启示

x402 exact scheme (EIP-3009) 的设计：

```typescript
// EIP-3009 签名绑定到特定 ERC20 合约
domain: {
  verifyingContract: asset,    // ✅ 资产绑定在 domain 中
  chainId,
  name,
  version
}

message: {
  from,
  to,
  value,
  // ❌ 没有 asset 字段，因为已在 domain 中
  ...
}
```

**启示**：**exact 也是强绑定模型** —— 每个签名针对一个特定的 ERC20 合约。

Channel 采用同样的哲学：**每个 channel 针对一个特定的资产**。

差异在于实现方式：

- exact: 通过 EIP-712 domain.verifyingContract 绑定
- channel (Rooch): 通过 ChannelKey 的 coin_type 绑定
- channel (EVM): 应该通过 channelId 计算包含 asset 来绑定

---

## 最终答案

### Q: asset 字段在 Rooch 实现中包含吗？

**A**: ❌ **不包含**。Rooch 的 SubRAV 结构中没有 asset/coin_type 字段，因为 channel_id 已经隐式绑定了资产类型。

### Q: 关键就是 channel 是否是和资产绑定的？

**A**: ✅ **是的，channel 应该与资产强绑定**。

**理由**：

1. **Rooch 已验证的设计**：生产环境运行，证明可行
2. **类型安全**：Channel ID 天然防止资产混淆
3. **实现简单**：验证逻辑清晰，Gas 成本低
4. **与 exact 一致**：都是每个支付工具绑定一种资产
5. **符合 channel 使用场景**：长期支付关系，单一资产高频交易

**多资产场景的解决方案**：

- 为每种资产开一个 channel（成本：多次 open_channel 调用）
- 用户的 PaymentHub 统一管理所有资产和 channels
- Facilitator 可以自动为用户选择合适的 channel

---

## 行动项

### 1. 立即修改（Critical）

- [ ] **核心规范**：在 Concepts 章节明确 channel 与 asset 强绑定
- [ ] **核心规范**：在 receipt 字段定义中说明 asset 不包含，因为隐含在 channel_id 中
- [ ] **核心规范**：添加 chain_id 作为 optional 字段（已在 Issue #1 part 1 讨论）

### 2. EVM 绑定重新设计（Important）

- [ ] 定义 channel_id 计算方法（包含 asset）
- [ ] 从 EIP-712 typed data 中移除 asset 字段
- [ ] 更新 Channel 结构，明确 asset 绑定
- [ ] 更新 Hub 接口，按资产管理 channels
- [ ] 添加多资产场景的使用指南

### 3. Rooch 绑定补充说明（Minor）

- [ ] 在文档中明确说明强绑定模型
- [ ] 补充说明为什么 SubRAV 不包含 coin_type
- [ ] 提供多资产使用的最佳实践示例

---

**结论**：采用 **强绑定模型**，asset 不在 receipt 中重复，而是隐含在 channel_id 中。这与 Rooch 实现一致，也符合 channel 的设计哲学。EVM 绑定需要按此模型重新设计。
