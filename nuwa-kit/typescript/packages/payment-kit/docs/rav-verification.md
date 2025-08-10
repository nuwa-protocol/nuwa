# RAV 验证规范（Specification）

> 面向多语言实现的抽象规范，独立于任何具体代码库。
> 关联协议文档：`rav-handling.md`（路由 FREE/PAID 行为、pending 优先级、DIDAuth 回退）。

---

## 1. 术语与对象

- SubRAV: 子收据与凭证（Unsigned）。字段：
  - version (u8)
  - chainId (u64)
  - channelId (ObjectId/32-byte hex)
  - channelEpoch (u64)
  - vmIdFragment (string) — 来自 DID 验证方法的 fragment
  - accumulatedAmount (u256)
  - nonce (u64)
- SignedSubRAV: { subRav: SubRAV, signature: bytes }
- Pending Unsigned SubRAV: 由服务端发给客户端等待签名的上一条提案。
- Baseline: 用于校验单调性的前置状态，来源二选一：
  - latestSigned — 最近一次已完成的 SignedSubRAV
  - subChannelState — 子通道链上游标（lastConfirmedNonce, lastClaimedAmount, epoch）

---

## 2. 输入与输出（RAV 验证器）

输入（一次 HTTP/API 请求的验证上下文）：
- routePolicy: { paymentRequired: boolean }
- didAuth (可选): { did: string, keyId: string }  // 仅用于定位子通道（无签名时）
- signedSubRAV (可选): SignedSubRAV
- pendingRepo: 只读接口：findLatestBySubChannel(channelId, vmIdFragment)
- baselineProvider: 只读接口：
  - getLatestSigned(channelId, vmIdFragment) → SignedSubRAV | null
  - getSubChannelState(channelId, vmIdFragment) → { epoch, nonce, accumulatedAmount } | null
- didResolver (可选): 通过 DID 文档验证签名
- channelInfoProvider（可选）: getChannelInfo(channelId) → { payerDid, epoch, status }
- defaultAssetId: 用于 DIDAuth 推导 channelId（见 rav-handling.md §4.4）

输出（验证结果）：
- decision: ALLOW | REQUIRE_SIGNATURE_402 | CONFLICT | INVALID_SIGNATURE | CHANNEL_NOT_FOUND
- baseline: { latestSigned?, subCursor?, chainId? }  // 用于后续生成下一条 unsigned
- pendingMatched: boolean  // 是否与 pending 完全匹配
- debugTrace: 验证步骤日志（可选，用于排查）

---

## 3. 总体流程（抽象算法）

1) 确定 (channelId, vmIdFragment)
- 若有 signedSubRAV：直接取 subRav.channelId / vmIdFragment
- 否则使用 didAuth：
  - vmIdFragment = keyId.split('#')[1]
  - channelId = deriveChannelId(didAuth.did, serviceDid, defaultAssetId)
- 若仍无法确定 → decision=CHANNEL_NOT_FOUND（或保守 ALLOW/402，取决于服务策略）

2) Pending 优先级（rav-handling.md §4.1）
- 查找 pendingRepo.findLatestBySubChannel(channelId, vmIdFragment)
- 若存在 pending：
  - 无 signedSubRAV：
    - FREE 路由：目标规范（Phase 2）应返回 REQUIRE_SIGNATURE_402
    - 兼容实现（Phase 1）可放行 ALLOW（不建议用于新实现）
  - 有 signedSubRAV：必须完全匹配 pending（channelId, vmIdFragment, nonce 相同），否则 CONFLICT

3) 签名与结构校验
- 若提供 didResolver：
  - 获取 payerDid：
    - 优先 didAuth.did；否则 channelInfoProvider.getChannelInfo(channelId).payerDid
  - 验证签名：verifyWithResolver(signedSubRAV, payerDid, didResolver) → true/false
  - 失败 → INVALID_SIGNATURE
- 若未提供 didResolver：
  - 允许跳过验签（不推荐），供早期兼容。新实现应强制提供 didResolver。
- 结构/域校验：
  - version 支持范围
  - channelId 格式
  - 非负字段（chainId/epoch/amount/nonce）

4) Epoch 与单调性（相对 Baseline）
- 基线解析：baseline = latestSigned or subChannelState
- Epoch 检查：
  - 若 baseline 存在：subRav.channelEpoch == baseline.epoch
- 单调性：
  - 允许“相同 RAV”（与 latestSigned 完全一致）
  - 允许“握手复位”（nonce=0 && amount=0）
  - 其余场景要求：
    - nonce 严格递增（new.nonce == prev.nonce + 1）
    - accumulatedAmount 不下降
  - 策略扩展（推荐）：仅在 cost=0 场景允许 amount 持平（由路由与计费策略提供上下文）

5) 结果
- 满足以上检查 → ALLOW
- 同时设置 pendingMatched、baseline（供后续生成下一条 unsigned）。

---

## 4. FREE/PAID 路由下的差异

- PAID（paymentRequired=true）
  - 有无成本（cost>0 / cost=0）均应在响应返回下一条 unsigned（nonce+1, amount+=cost）
  - 缺基线（无 latest/无 cursor/无已签名）→ 应报错（例如 MISSING_CHANNEL_CONTEXT）
- FREE（paymentRequired=false）
  - 不返回 unsigned
  - 若存在 pending 但本次未携带匹配签名 → 目标规范（Phase 2）要求返回 402

---

## 5. 安全与一致性

- 始终优先处理 pending，以避免跳过上一条待签名提案造成状态分叉。
- 签名校验必须基于 payerDid 对齐到 DID 文档中的具体密钥（vmIdFragment → verificationMethod）。
- 单调性校验必须依赖可靠 Baseline：优先 latestSigned，其次 subChannelState。
- 防止重放：相同 RAV 仅允许“精确重复”或“握手复位”，不得允许任意旧 RAV。

---

## 6. 参考伪代码（语言无关）

```
function verifyRAV(ctx, deps): Result {
  const { routePolicy, didAuth, signed } = ctx;
  const result = { decision: 'ALLOW', pendingMatched: false };

  // 1) Locate channel
  const vmId = signed?.subRav.vmIdFragment ?? didAuth?.keyId?.split('#')[1];
  const channelId = signed?.subRav.channelId ?? deriveChannelId(didAuth.did, serviceDid, deps.defaultAssetId);
  if (!channelId || !vmId) return { decision: 'CHANNEL_NOT_FOUND' };

  // 2) Pending priority
  const pending = deps.pendingRepo.findLatestBySubChannel(channelId, vmId);
  if (pending) {
    if (!signed) {
      return routePolicy.paymentRequired ? { decision: 'REQUIRE_SIGNATURE_402' } : { decision: 'REQUIRE_SIGNATURE_402' }; // Phase 2 推荐
    }
    if (signed.subRav.nonce != pending.nonce) return { decision: 'CONFLICT' };
    result.pendingMatched = true;
  }

  // 3) Signature check
  if (signed && deps.didResolver) {
    const payerDid = didAuth?.did ?? deps.channelInfoProvider?.getChannelInfo(channelId).payerDid;
    if (!verifyWithResolver(signed, payerDid, deps.didResolver)) return { decision: 'INVALID_SIGNATURE' };
  }

  // 4) Baseline & monotonicity
  const base = deps.baselineProvider.getLatestSigned(channelId, vmId) ?? deps.baselineProvider.getSubChannelState(channelId, vmId);
  if (base) {
    if (signed && signed.subRav.channelEpoch != base.epoch) return { decision: 'CONFLICT' };
    // allow: same, handshake-reset, else nonce++ and amount >= prev
  }

  return result;
}
```

---

## 7. 关键测试点（语言无关）

- Pending 优先级：
  - 存在 pending + 未签名 + PAID → REQUIRE_SIGNATURE_402
  - 存在 pending + 未签名 + FREE → REQUIRE_SIGNATURE_402（Phase 2 目标）
  - 存在 pending + 签名 nonce 不匹配 → CONFLICT
  - 存在 pending + 签名匹配 → pendingMatched=true
- 签名校验：
  - 正确/错误签名；缺失 didResolver 时的行为（新实现应强制提供）
  - vmIdFragment 与 DID 文档的 verificationMethod 匹配
- Baseline 选择：
  - latestSigned 存在时优先；否则 subChannelState
  - epoch 不匹配 → 冲突
- 单调性：
  - 相同 RAV 允许；握手复位允许；其他场景 nonce++ 且 amount 不降
  - 策略化 amount 持平（仅 cost=0）
- FREE/PAID：
  - PAID：cost=0 也返回下一条 unsigned
  - FREE：不返回 unsigned；pending+未签名 → 402（Phase 2）

---

## 8. 接口建议（最小必需）

- PendingStore: findLatestBySubChannel(channelId, vmIdFragment)
- BaselineProvider:
  - getLatestSigned(channelId, vmIdFragment)
  - getSubChannelState(channelId, vmIdFragment)
- DIDResolver: resolve DID 文档与公钥材料
- ChannelInfoProvider: getChannelInfo(channelId) → payerDid/epoch 等

以上接口可由任意语言实现，只要满足输入输出契约，即可与此验证规范对齐。
