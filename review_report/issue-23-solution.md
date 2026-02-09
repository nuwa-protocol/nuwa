# Issue #23 解决方案：术语统一

## 问题分析

三个文档中存在的术语不一致：

| 概念               | 核心规范             | EVM 绑定            | Rooch 绑定           | 问题          |
| ------------------ | -------------------- | ------------------- | -------------------- | ------------- |
| **Sub-channel ID** | `sub_channel_id`     | `subChannelId`      | `vm_id_fragment`     | ❌ 严重不一致 |
| **Epoch**          | `epoch`              | `epoch`             | `channel_epoch`      | ⚠️ Rooch 不同 |
| **Accumulated**    | `accumulated_amount` | `accumulatedAmount` | `accumulated_amount` | ⚠️ 大小写不同 |
| **Payee**          | `payee_id`           | `payee`             | `payee_id`           | ⚠️ EVM 不同   |
| **Channel ID**     | `channel_id`         | `channelId`         | `channel_id`         | ⚠️ 大小写不同 |

## 根本原因

不同上下文有不同的命名约定：

- **JSON Transport (x402)**: snake_case（Web 标准）
- **Solidity (EVM)**: camelCase（Solidity 约定）
- **Move (Rooch)**: snake_case（Move 约定），但某些字段有特殊含义（如 `vm_id_fragment` 是 DID 特有概念）

## 解决方案

### 原则

1. **核心规范**：使用 snake_case（JSON transport 标准）
2. **绑定文档**：遵循各自生态的命名约定，但**必须明确映射关系**
3. **特殊术语**：如 `vm_id_fragment` (Rooch 特有) 需要明确说明是 `sub_channel_id` 的别名

### 具体修改

#### 1. EVM 绑定：添加 "Field name mapping" 章节

在文档开头（Identity and signatures 之前）添加映射说明。

#### 2. Rooch 绑定：完善 "Receipt canonicalization and encoding" 章节

补全所有字段的映射关系（同时解决 Issue #18）。

#### 3. 核心规范：明确说明别名

在 receipt 字段定义中，明确哪些字段在不同绑定中可能有不同名称。

---

## 实施计划

1. ✅ 在 EVM 绑定开头添加完整的字段映射表
2. ✅ 在 Rooch 绑定中补全字段映射（包括 payerKey, payee_id, payer_signature）
3. ✅ 统一所有文档中的占位符格式
4. ✅ 更新核心规范，说明 `vm_id_fragment` 是 `sub_channel_id` 的 Rooch 专用术语
