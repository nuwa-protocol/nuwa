# Issue #22 修改总结：channel_id 格式统一

**Issue ID**: #22 (Critical)  
**修改日期**: 2025-10-27  
**相关 Issue**: #24 (占位符风格统一) 部分解决

---

## 问题描述

**问题**: 文档中 `channel_id` 字段使用了不一致的格式：

- **核心规范和 Rooch 绑定**: 使用 `"ch_0xabc..."` 格式（带 `ch_` 前缀）
- **EVM 绑定**: 使用 `"0xabcd..."` 格式（纯 hex）
- **字段映射表**: 说明 `channel_id` 是 "hex string"（暗示不应有前缀）

**影响**:

- ❌ 开发者可能不清楚 `ch_` 前缀是否是数据的一部分
- ❌ 不同实现可能产生不兼容的行为
- ❌ 与 Rooch 实际实现代码不一致（代码中使用 ObjectID，即纯 hex）

**来源**: Review 报告 Line 334-341

---

## 解决方案

### 统一为纯 hex 格式

**决策**: 统一使用 **纯 hex 格式** `"0xabc123..."`，去掉 `ch_` 前缀

**理由**:

1. ✅ **与实现一致**: Rooch 代码中 `channel_id` 就是 `ObjectID` (32字节 hex)
2. ✅ **与 EVM 对齐**: EVM 绑定已经使用纯 hex
3. ✅ **符合映射表**: 字段映射表明确说明是 "hex string"
4. ✅ **减少混淆**: 避免开发者误认为需要解析/添加前缀
5. ✅ **标准化**: hex string 是区块链生态的标准格式

---

## 具体修改

### 修改 1: 核心规范 (scheme_channel.md)

**位置**: Line 38-52 和 Line 61-76（两处示例）

**修改前**:

```json
"receipt": {
  "channel_id": "ch_0xabc...",
  ...
}
```

**修改后**:

```json
"receipt": {
  "channel_id": "0xabc123...",
  ...
}
```

**变化**:

- ❌ 去掉 `ch_` 前缀
- ✅ 使用更完整的占位符 `0xabc123...`（显示更多 hex 字符）

### 修改 2: Rooch 绑定 (scheme_channel_rooch.md)

**位置**: Line 157-171（/verify 请求示例）

**修改前**:

```json
"receipt": {
  "channel_id": "ch_0xabc...",
  ...
}
```

**修改后**:

```json
"receipt": {
  "channel_id": "0xabc123...",
  ...
}
```

**变化**:

- ❌ 去掉 `ch_` 前缀
- ✅ 与核心规范保持一致

### EVM 绑定 - 无需修改

EVM 绑定已经使用纯 hex 格式 `"0xabcd..."`，无需修改。

---

## 格式规范

### 统一后的 channel_id 格式

**在所有文档和实现中**:

```json
{
  "channel_id": "0xabc123..."
}
```

**规范说明**:

- ✅ `0x` 前缀（标准 hex 表示）
- ✅ 后跟 64 位 hex 字符（32字节 = 256位，完整形式）
- ✅ 示例中可以用 `...` 省略中间部分，但保留足够字符以示例清晰
- ❌ 不使用 `ch_` 或其他自定义前缀

### 占位符风格（同时改进）

在修改过程中，我们也改进了占位符风格：

**修改前**:

- `"ch_0xabc..."` - 很短，不够清晰
- `"0xdef..."` - 变化不够

**修改后**:

- `"0xabc123..."` - 显示更多字符，更清晰
- 保持与其他字段占位符风格的一致性

---

## 对实现的影响

### Rooch 实现

✅ **无需修改代码**：Rooch 代码已经使用 `ObjectID` (纯 hex)
✅ **文档现在与代码对齐**

### EVM 实现

✅ **已经是正确格式**：无需改变

### 客户端实现

✅ **简化解析**：

- **之前**: 可能需要判断是否有 `ch_` 前缀
- **现在**: 直接解析为 hex string

### Facilitator 实现

✅ **统一处理**：

- 所有绑定的 JSON payload 使用相同格式
- 简化验证逻辑

---

## 与其他 issues 的关系

### Issue #24 (占位符风格统一) - 部分解决

Issue #24 提到：

> **问题**: 占位符风格不统一
>
> - 核心规范: `"0x..."`, `"ch_0xabc..."`
> - EVM: `"0xabcd..."`, `"0x9f..."`
> - Rooch: `"ch_0xabc..."`, `"did:rooch:0x...#key-1"`

**本次修改解决了**:

- ✅ `ch_0xabc...` 已统一为 `0xabc123...`
- ✅ `channel_id` 在所有文档中格式一致

**仍待解决**:

- ⚠️ 其他字段的占位符长度不一（`0x9f...` vs `0xabcd...` vs `0xabc123...`）
- ⚠️ 是否需要统一为显示头尾的格式（`0xabc...def`）

---

## 验证

### 检查列表

- [x] 核心规范的两处示例都已修改
- [x] Rooch 绑定的示例已修改
- [x] EVM 绑定已经是正确格式（无需修改）
- [x] 所有 `channel_id` 现在都使用 `0x` + hex 格式
- [x] 去掉了所有 `ch_` 前缀
- [x] 占位符显示了足够的字符（`0xabc123...`）

### 全局搜索验证

```bash
# 确认没有遗漏的 ch_ 前缀
grep -r "ch_0x" deps/x402/specs/schemes/channel/
# 应该返回 0 结果
```

---

## 文件变更清单

| 文件                      | 修改位置         | 变更内容                           |
| ------------------------- | ---------------- | ---------------------------------- |
| `scheme_channel.md`       | Line 44, Line 67 | 2处: `ch_0xabc...` → `0xabc123...` |
| `scheme_channel_rooch.md` | Line 163         | 1处: `ch_0xabc...` → `0xabc123...` |
| `scheme_channel_evm.md`   | -                | 无需修改（已是正确格式）           |

**总计**: 3 处修改，2 个文件

---

## 后续建议

虽然 Issue #22 已完全解决，但建议进一步统一其他占位符：

### 1. 统一所有 hex 占位符的长度

**当前状态**:

- `"0x9f..."` - 3 位 hex
- `"0xabcd..."` - 4 位 hex
- `"0xabc123..."` - 6 位 hex
- `"0xdef..."` - 3 位 hex

**建议**: 统一为 6-8 位 hex + `...`，以保持清晰度和一致性

### 2. 考虑头尾显示格式

对于更长的 ID（如 32字节 channel_id），可以考虑：

```json
"channel_id": "0xabc123...def789"
```

显示头部和尾部，帮助区分不同的示例。

---

## 设计说明文档更新

建议在每个绑定文档的字段映射表中添加格式说明：

### EVM 绑定（已有映射表，可补充）

```markdown
| `channel_id` | string (hex) | `channelId` | bytes32 | Parse hex string to bytes32; format: `0x` + 64 hex chars |
```

### Rooch 绑定（已有映射表，可补充）

```markdown
| `channel_id` | ObjectID | `channel_id` | string (hex) | Hex-encoded ObjectID; format: `0x` + 64 hex chars (32 bytes) |
```

---

**修改完成日期**: 2025-10-27  
**下一步**: 可以继续解决其他 Critical/Important issues，或完善 Issue #24（全面统一占位符风格）
