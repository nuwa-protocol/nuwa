# Persistent Pending-RAV Design for `HttpBillingMiddleware`

> **Status:** Draft – implementation work tracked in `RFC-0012` (TBD)

## 1  Background
`HttpBillingMiddleware` 当前用两个内存 Map 保存临时状态：

| 字段 | 作用 | 键 | 值 |
|------|------|----|----|
| `pendingSubRAVs` | 服务器发送给客户端、等待签名的 *未签名* Sub-RAV | `"<channelId>:<nonce>"` | `SubRAV` |
| `pendingClaims` | 客户端返还并已通过验签、等待链上 `claim` 的 *已签名* Sub-RAV | `channelId` | `SignedSubRAV[]` |

当进程重启或 Pod 滚动更新时，这两块数据全部丢失，导致：

* 客户端下次请求携带的已签名 RAV 在服务器端找不到对应的 `pendingSubRAV` → 报错 `UNKNOWN_SUBRAV`。
* 已达到自动结算阈值的 RAV 无法 claim，资金滞留在支付通道。

与此同时，代码库已经提供了持久化抽象：

* **`RAVStore`** —— 各类实现（Memory / IndexedDB / PostgreSQL）用于持久化 *已签名* RAV。
* **`ClaimScheduler`** —— 周期扫描 `RAVStore.getUnclaimedRAVs` 并提交 `claim` 交易。
* **`ChannelStateStorage`** —— 缓存通道／子通道元数据。

缺口仅在于 Middleware 没有把数据写进这些存储层，也缺少 *未签名* Proposal 的持久化方案。

## 2  设计目标
1. **重启安全** —— Server 进程崩溃或升级后能够继续处理同一批请求/claim。
2. **多实例横向扩容** —— 多个网关共享数据库时保持状态一致。
3. **单一职责** —— Middleware 只负责
   * 计费
   * 生成 Proposal
   * 校验客户端支付并写入存储
   Claim 逻辑统一交由 `ClaimScheduler`。
4. **向后兼容** —— 不破坏现有 Memory 模式；未配置持久化时仍可工作（只是无重启保证）。

## 3  存储层改动
### 3.1  已签名 Sub-RAV
在 `PaymentChannelPayeeClient.processSignedSubRAV` 成功验证后调用
```ts
await this.ravStore.save(signedSubRAV);
```
其中 `ravStore` 通过构造参数注入：
```ts
interface PaymentChannelPayeeClientOptions {
  …
  ravStore: RAVStore; // ❶ 新增
}
```
这样所有经服务器确认的 RAV 都落盘，`ClaimScheduler` 重启后即可继续工作。

### 3.2  未签名 Sub-RAV (Proposal)
新增独立接口，避免污染现有 `RAVStore`：
```ts
export interface PendingSubRAVStore {
  save(rav: SubRAV): Promise<void>;
  find(channelId: string, nonce: bigint): Promise<SubRAV | null>;
  remove(channelId: string, nonce: bigint): Promise<void>;
  cleanup(maxAgeMs?: number): Promise<number>; // 过期清理
}
```
* **默认实现**：内存 Map（兼容原行为）。
* **SQL 实现**：`nuwa_rav_proposals` 表，结构见 §6。

`HttpBillingMiddlewareConfig` 新字段：
```ts
pendingSubRAVStore?: PendingSubRAVStore;
```
使用逻辑替换原 `Map`：
* 生成 Proposal ➜ `pendingSubRAVStore.save(proposal)`
* 客户端返还签名 ➜ `pendingSubRAVStore.find()` 校验后 `remove()`

## 4  自动 Claim 职责划分
| 组件 | 责任 | 变化 |
|-------|-------|-------|
| **Middleware** | 写入 `ravStore`；可选择调用 `scheduler.triggerClaim(channelId)` 做 *立即结算* | 移除 `pendingClaims` 或仅作热缓存 |
| **ClaimScheduler** | 周期 `ravStore.getUnclaimedRAVs` ➜ 满足策略就 `claim` | 逻辑保持不变 |

启动流程：
```
await claimScheduler.start();                // 先启动，保证及时 claim
await pendingSubRAVStore.cleanup(old…);      // 可选：清理过期 Proposal
```

## 5  接口/配置变更一览
```
┌─ HttpBillingMiddlewareConfig
│   + pendingSubRAVStore?: PendingSubRAVStore
│
├─ PaymentChannelPayeeClientOptions
│   + ravStore: RAVStore
│
└─ New interface PendingSubRAVStore
```

## 6  SQL 表结构示例
```sql
-- 已签名 RAV（现有表，新增 signed 标记可选）
CREATE TABLE IF NOT EXISTS nuwa_ravs (
  channel_id TEXT NOT NULL,
  vm_id_fragment TEXT NOT NULL,
  nonce NUMERIC(78,0) NOT NULL,
  accumulated_amount NUMERIC(78,0) NOT NULL,
  rav_data BYTEA NOT NULL,
  signed BOOLEAN DEFAULT TRUE,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  PRIMARY KEY(channel_id, vm_id_fragment, nonce)
);

-- 未签名 Proposal
CREATE TABLE IF NOT EXISTS nuwa_rav_proposals (
  channel_id TEXT NOT NULL,
  nonce NUMERIC(78,0) NOT NULL,
  vm_id_fragment TEXT NOT NULL,
  accumulated_amount NUMERIC(78,0) NOT NULL,
  proposal_data BYTEA NOT NULL,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  PRIMARY KEY(channel_id, nonce)
);
```

## 7  迁移与兼容性
* **Memory-only 部署**：无需迁移。新接口使用内存实现，行为与旧版一致（仍无重启保障）。
* **SQL 部署**：
  1. 执行 §6 DDL
  2. 注入 `SqlRAVStore` & `SqlPendingSubRAVStore`（待实现）到配置
  3. 部署新版服务
* **滚动升级**：建议顺序
  1. 部署新数据库表
  2. 滚动升级应用实例
  3. 观察日志与 `ClaimScheduler` 状态确认正常

## 8  后续工作
- [ ] `PendingSubRAVStore` interface & Memory/SQL 实现
- [ ] 修改 `HttpBillingMiddleware` 以使用新 Store
- [ ] 在 `PaymentChannelPayeeClient` 中写入 `RAVStore`
- [ ] 单元测试：重启后处理流程不出错
- [ ] 文档/示例代码更新

---
© Nuwa Network – Payment Kit
 