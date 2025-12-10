# RAV 重构简化方案：单入口验证聚合

> 目标：在不增加大量模块/目录的前提下，把“pending 检查 + DIDAuth 回退 + 签名校验 + 基线解析”聚合到一个可测试、可观测的单入口，降低排查复杂度，同时保持现有行为不变（Phase 1）。
>
> 适用范围：`PaymentProcessor` 服务端结算流程。

---

## 1 原则

- 单入口聚合：提供一个 `RavVerifier.verify()`，封装所有验证与解析步骤；
- 最少改动：不新建多层目录，仅新增一个核心文件，现有文件作轻量改造；
- 强可观测：统一返回结构化结果与 `debugTrace` 步骤日志，定位问题更直接；
- 保持行为：Phase 1 不改变任何对外行为与错误码；Phase 2 再切换到 `rav-handling.md` 目标协议；
- 可单测：`RavVerifier` 易于 mock 依赖进行单元测试。

---

## 2 单入口接口设计

- 新增文件：`src/core/RavVerifier.ts`

```ts
export interface RavVerifyDeps {
  payeeClient: PaymentChannelPayeeClient;
  pendingRepo: PendingSubRAVRepository;
  ravRepo?: RAVRepository;
  defaultAssetId: string; // 用于 deterministic channel 推导
  debug?: boolean;
}

export type RavDecision = 'ALLOW' | 'REQUIRE_SIGNATURE_402' | 'CONFLICT' | 'CHANNEL_NOT_FOUND'; // 仅用于内部态，最后映射为统一 error header

export interface RavBaseline {
  channelId?: string;
  vmIdFragment?: string;
  latestSigned?: SignedSubRAV | null;
  subCursor?: { channelId: string; epoch: bigint; accumulatedAmount: bigint; nonce: bigint } | null;
  chainId?: bigint;
}

export interface RavVerifyResult {
  decision: RavDecision;
  baseline: RavBaseline;
  signedVerified: boolean; // 是否已验证签名（若有）
  pendingMatched: boolean; // 已匹配 pending（若存在）
  error?: { code: string; message: string };
  debugTrace: Array<{ step: string; info?: unknown }>; // 用于排查
}

export async function verify(
  billingCtx: BillingContext,
  deps: RavVerifyDeps
): Promise<RavVerifyResult>;
```

功能聚合：

- pending 优先级检查（缺签名 → `REQUIRE_SIGNATURE_402`；签名不匹配 → `CONFLICT`）；
- DIDAuth 回退定位 `(channelId, vmIdFragment)`；
- 签名验证（调用 `PaymentChannelPayeeClient.verifySubRAV()`）；
- 基线解析（`ravRepo.latest` 或 `payeeClient.getSubChannelState()` + `chainId`）；
- 统一生成结构化结果与 `debugTrace`。

---

## 3 与现有代码的衔接

- `PaymentProcessor.preProcess()`：
  - 直接调用 `RavVerifier.verify(ctx, deps)`；
  - 按 `result.decision` 设置 `ctx.state`：
    - `ALLOW`：继续；
    - `REQUIRE_SIGNATURE_402`/`CONFLICT`：将 `result.error` 映射到现有错误码（保持不变）并提前返回；
  - 将 `result.baseline` 写入 `ctx.state.latestSignedSubRav`、`ctx.state.subChannelState`、`ctx.state.chainId`；
  - 将 `result.signedVerified` 赋给 `ctx.state.signedSubRavVerified`；

- `PaymentProcessor.settle()`：
  - 行为保持原样；使用 `ctx.state` 中的 baseline（由 `RavVerifier` 已填充）。

- `PaymentProcessor.confirmDeferredPayment()` 与 `checkPendingProposalPriority()`：
  - 精简为内部转调 `RavVerifier.verify()`，或保留为兼容薄封装；

- `PaymentChannelPayeeClient`：
  - 不变；`RavVerifier` 复用其 `verifySubRAV()`、`getSubChannelState()`、`getChannelInfo()` 等能力。

- `SubRavValidator.ts` / `SubRAVManager`：
  - 保持现状；仅修正 `SubRAVManager.validate()` 的调用链问题（避免引用不存在的 `SubRAVValidator.validate`）。

---

## 4 行为对齐（Phase 1 与 Phase 2）

- Phase 1（不改行为）：
  - `verify()` 的判定逻辑按现有 `PaymentProcessor` 与 `PaymentChannelPayeeClient` 的已实施逻辑实现；
  - 错误码与 Header 形态不变；

- Phase 2（与 `rav-handling.md` 对齐）：
  - FREE 路由：无 RAV 正常执行，不返回 unsigned；若定位到 pending 且缺签名 → 402；
  - Paid 路由：即使 `cost=0` 也生成下一条 unsigned；
  - 允许 `amount` 持平仅在 `cost=0` 场景；
  - 客户端不再发送握手 RAV；

上述切换点集中在 `verify()` 与 `settle()` 的极少数分支中，便于灰度与对比测试。

---

## 5 实施步骤（最小化改造）

1. 新增 `src/core/RavVerifier.ts`：实现上表 API 与聚合逻辑；
2. 在 `PaymentProcessor.preProcess()` 中用 `RavVerifier.verify()` 替换：
   - `checkPendingProposalPriority()`
   - `tryDIDAuthFallback()`
   - `confirmDeferredPayment()`
   - baseline 与 chainId 解析的散落逻辑
3. 保持 `settle()`/`persist()` 现状；
4. 修正 `SubRAVManager.validate()` 的调用链；
5. 单测：
   - `RavVerifier`：覆盖 pending 缺签名/不匹配、签名失败、baseline 解析成功/失败；
   - `PaymentProcessor.preProcess()`：对 `RavVerifier` 结果的状态填充与错误映射；

---

## 6 优势

- 更高聚合度：所有验证/解析/协调在一个入口内，问题定位只看一处 `debugTrace`；
- 更小的改动面：仅引入一个新文件与少量编排调整；
- 迭代可控：Phase 2 的协议差异通过 `RavVerifier` 与 `settle()` 的少量分支开关即可切换；
- 兼容稳定：外部 API 不变，测试无需大规模改写。

---

## 7 待办清单

- [ ] 新增 `src/core/RavVerifier.ts` 与单元测试
- [ ] `PaymentProcessor.preProcess()` 改为单入口调用并填充 `ctx.state`
- [ ] 精简/兼容旧的 `confirmDeferredPayment()` 与 `checkPendingProposalPriority()`
- [ ] 修正 `SubRAVManager.validate()` 调用链
- [ ] Phase 2 行为开关预留（常量/配置）

---

如需，我可以直接按上述“最小化改造”落地代码，并保持所有测试绿色。
