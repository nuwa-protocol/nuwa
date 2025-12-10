# RAV 模块化重构方案（服务器端）

> 适用范围：HTTP Payment Kit（Express 服务端）与其内部结算流程
>
> 相关代码：`src/core/SubRavValidator.ts`、`src/core/SubRav.ts`（`SubRAVManager`）、`src/core/PaymentProcessor.ts`、`src/client/PaymentChannelPayeeClient.ts`
>
> 设计依据：`docs/rav-handling.md`

---

## 1 背景与目标

当前服务端关于 RAV 的生成、验证与检查逻辑分散在多个类与工具函数中：

- 生成：分布在 `PaymentProcessor`、`PaymentChannelPayeeClient` 等处；
- 验证：既有 `PaymentChannelPayeeClient.verifySubRAV()`，又有 `PaymentProcessor.confirmDeferredPayment()` 针对 pending 协调；
- 状态检查/协调：`PaymentProcessor.checkPendingProposalPriority()` 与 DIDAuth Fallback 逻辑；
- 进度校验：`SubRavValidator.ts` 与 `PaymentUtils.validateSubRAV()` 存在职责重叠；

这导致：

- 逻辑重复与不一致（例如 `SubRAVManager.validate()` 调用的 `SubRAVValidator.validate` 与文件实际导出不一致）；
- 演进困难（free/paid 路由差异、pending 优先级、cost=0 的返回策略等分散在多处）；
- 测试覆盖难以聚焦（需要跨越多类验证完整协议路径）。

本方案基于 `rav-handling.md` 的状态机与服务端行为，统一抽象 RAV 核心能力，明确“谁负责什么”，并规划两阶段重构：

- Phase 1：不改行为（所有测试保持绿色），抽取/收敛重复逻辑，补齐 API；
- Phase 2：切换到文档所述目标协议行为（FREE/PAID、pending 优先级、DIDAuth 回退、`cost=0` 仍返回 unsigned 等）。

---

## 2 现状梳理（问题列表）

- `SubRavValidator.ts`
  - 仅提供 `assertRavProgression` / `assertSubRavProgression`，没有 `validate` 导出。
  - 与 `PaymentUtils.validateSubRAV()` 存在职责重叠；缺少“允许 `amount` 持平”的可配置校验入口。

- `SubRAVManager`（见 `src/core/SubRav.ts`）
  - 封装签名/验证（对外依赖 Signer/DID Resolver），但 `validate()` 当前调用了不存在的 `SubRAVValidator.validate`，与实现不符。

- `PaymentChannelPayeeClient`
  - `verifySubRAV()` 完成签名验证与进度校验，但与 `PaymentProcessor.confirmDeferredPayment()` 的“pending 对齐检查”重复；
  - 针对“首次/握手/相同 SubRAV”的容忍策略存在历史兼容分支，未来需要与 `rav-handling.md` Phase 2 对齐；
  - 存在与链/本地仓库的状态游标同步逻辑，易与 `PaymentProcessor` 中的 baseline 查找重复。

- `PaymentProcessor`
  - 既负责路由层结算编排（pre/settle/persist），又承载了大量“RAV 领域能力”（pending 优先级、DIDAuth fallback、基线解析、提案生成）；
  - `confirmDeferredPayment()` 与 `PaymentChannelPayeeClient.confirmSignedProposal()` 能力交叉；
  - `generateSubRAVSync()` / `buildFollowUpUnsigned()` 作为“提案生成器”应抽出为可复用模块；
  - 已按文档实现“paid 路由即使 `cost=0` 也生成 unsigned”，但该行为应沉淀为策略模块，而非散落在结算处。

---

## 3 目标架构与分层

在不改变外部对 `PaymentProcessor` 的使用前提下，将“RAV 领域能力”模块化，形成单一入口但多模块互相解耦：

- 核心模块（新建 `src/core/rav/` 目录）：
  - `RavProgressionValidator`：进度校验（nonce/amount 单调），提供 `allowSameAccumulated` 选项；
  - `RavVerificationService`：签名验证 + pending 匹配校验的统一入口；
  - `RavBaselineResolver`：解析 `(channelId, vmIdFragment)` 与 baseline（latestSigned / subChannel cursor / chainId）；
  - `RavPendingCoordinator`：pending 优先级检查，生成“是否 402/是否继续”的决策对象；
  - `RavProposalBuilder`：从 baseline + cost 生成下一条 unsigned SubRAV，并产出 HTTP Response Header；
  - `RavPolicy`：基于 `RouteOptions`（free/paid）与 `rav-handling.md` 的策略决策（包括 `cost=0` 行为）；
  - `RavRecovery`：仅供 Phase 2 使用的恢复流程（由 `(payerDid, serviceDid, defaultAssetId)` 推导 deterministic channel 决策何时 `/recovery`）。

- 编排层：
  - `PaymentProcessor` 精简为“编排器”：
    - `preProcess()`：委派给 `RavPendingCoordinator`、`RavVerificationService`、`RavBaselineResolver`；
    - `settle()`：委派给 `RavPolicy` 决策是否生成提案，并由 `RavProposalBuilder` 产出 header；
    - `persist()`：只持久化 `unsignedSubRav`，并交由 `PendingSubRAVRepository` 做清理；
  - `PaymentChannelPayeeClient`：保留链/仓库访问与签名校验的底层能力，不再承担 pending 协调职责。

关系示意：

```text
Request → PaymentProcessor
  ├─ preProcess
  │   ├─ RavPendingCoordinator (402/continue)
  │   ├─ RavVerificationService (签名 + pending 匹配)
  │   └─ RavBaselineResolver (latestSigned / subCursor / chainId)
  ├─ settle
  │   ├─ RavPolicy (FREE/PAID，cost=0 策略)
  │   └─ RavProposalBuilder (unsigned + header)
  └─ persist
      └─ PendingSubRAVRepository.save / remove(previous)
```

---

## 4 公共 API 草案（不改外部使用习惯）

### 4.1 Validator

```ts
// src/core/rav/RavProgressionValidator.ts
export interface ProgressionCheckOptions {
  allowSameAccumulated?: boolean; // cost=0 时允许相等
}

export function assertProgression(
  prev: { nonce: bigint; amount: bigint },
  next: { nonce: bigint; amount: bigint },
  options?: ProgressionCheckOptions
): void;
```

迁移：现有 `SubRavValidator.assert*` 保留并转调至新实现，标注 deprecated。

### 4.2 Verification

```ts
// src/core/rav/RavVerificationService.ts
export interface VerificationContext {
  pendingRepo: PendingSubRAVRepository;
  payeeClient: PaymentChannelPayeeClient;
}

export interface VerificationResult {
  isValid: boolean;
  error?: string;
  payerKeyId?: string; // for logging / DIDAuth fallback coherence
}

export async function verifyAgainstPending(
  signed: SignedSubRAV,
  ctx: VerificationContext
): Promise<VerificationResult>;
```

迁移：

- `PaymentProcessor.confirmDeferredPayment()` → 调用 `verifyAgainstPending()`；
- `PaymentChannelPayeeClient.confirmSignedProposal()` → 精简为同一路径，或直接删除并用新服务代替；
- 单一来源的 pending 匹配 + 签名校验，避免重复实现。

### 4.3 Baseline 解析

```ts
// src/core/rav/RavBaselineResolver.ts
export interface DidAuthInfo {
  did?: string;
  keyId?: string;
}

export interface BaselineResult {
  channelId?: string;
  vmIdFragment?: string;
  latestSigned?: SignedSubRAV | null;
  subCursor?: { channelId: string; epoch: bigint; accumulatedAmount: bigint; nonce: bigint } | null;
  chainId?: bigint;
}

export async function resolveBaseline(opts: {
  signedSubRav?: SignedSubRAV;
  didAuth?: DidAuthInfo;
  payeeClient: PaymentChannelPayeeClient;
  ravRepo?: RAVRepository;
  defaultAssetId: string;
}): Promise<BaselineResult>;
```

迁移：`PaymentProcessor.preProcess()` 只拿结果，不再内置 DIDAuth 细节与仓库读取细节。

### 4.4 Pending 优先级

```ts
// src/core/rav/RavPendingCoordinator.ts
export interface PendingDecision {
  shouldReturnEarly: boolean; // 返回 402 或冲突
  error?: { code: string; message: string };
}

export async function checkPendingFirst(opts: {
  channelId?: string;
  vmIdFragment?: string;
  signedSubRav?: SignedSubRAV;
  paymentRequired?: boolean; // route policy input
  pendingRepo: PendingSubRAVRepository;
}): Promise<PendingDecision>;
```

迁移：把 `PaymentProcessor.checkPendingProposalPriority()` 逻辑下沉，保留现有返回语义。

### 4.5 提案生成

```ts
// src/core/rav/RavProposalBuilder.ts
export interface ProposalBuildInput {
  cost: bigint;
  clientTxRef: string; // required
  baseline:
    | { type: 'signed'; value: SignedSubRAV }
    | {
        type: 'cursor';
        value: { channelId: string; epoch: bigint; accumulatedAmount: bigint; nonce: bigint };
        vmIdFragment: string;
        chainId: bigint;
      };
}

export interface ProposalBuildOutput {
  unsigned: SubRAV;
  headerValue: string; // HttpPaymentCodec
  serviceTxRef: string;
}

export function buildProposalSync(input: ProposalBuildInput): ProposalBuildOutput;
```

迁移：把 `generateSubRAVSync()` 与 `buildFollowUpUnsigned()` 全量迁移至此；`PaymentProcessor.settle()` 仅调用该模块。

### 4.6 策略（FREE/PAID + cost=0）

```ts
// src/core/rav/RavPolicy.ts
export interface RoutePolicyInput {
  paymentRequired: boolean;
  hasSigned: boolean;
  cost: bigint;
}

export interface RoutePolicyDecision {
  shouldGenerateUnsigned: boolean;
  // FREE 路由下收到 SignedSubRAV 时的约束、是否回写 header 等
}

export function decideRoutePolicy(input: RoutePolicyInput): RoutePolicyDecision;
```

迁移：明确 `paid` 路由在 `cost=0` 时仍返回 unsigned 的规则，FREE 路由不返回 unsigned，且结合 pending 决策决定是否 402。

---

## 5 与 `rav-handling.md` 的对齐点

- Pending 优先级（§4.1）：统一由 `RavPendingCoordinator` 决策，且在 FREE 路由上允许通过（但若 DIDAuth 定位到存在 pending 且缺签名，返回 402）；
- Paid 路由（§4.2）：即使 `cost=0`，也生成“下一条 Unsigned SubRAV”（由 `RavPolicy` 强制）；
- Free 路由（§4.3）：
  - 携带 SignedSubRAV：验证并结算（成本为 0），不返回 unsigned；
  - 不携带 RAV：正常执行业务，不附带支付 Header；若经 DIDAuth 定位到 pending 且缺签名，返回 402；
- DIDAuth fallback（§4.4）：归并到 `RavBaselineResolver.resolveBaseline()`，由 `PaymentProcessor` 统一调用。

---

## 6 迁移计划

### Phase 1（不改行为，测试保持绿色）

- 新增 `src/core/rav/` 模块：`RavProgressionValidator`、`RavVerificationService`、`RavBaselineResolver`、`RavPendingCoordinator`、`RavProposalBuilder`、`RavPolicy`；
- `SubRavValidator.ts`
  - 保留 `assert*`，并在顶层导出中标注 deprecated；
  - 新增导出：从 `RavProgressionValidator` 透传一个 `assertSubRavProgression`，保证旧 API 不变；
- `SubRAVManager`
  - 修正 `validate()`，改为调用 `PaymentUtils.validateSubRAV()` 或新的 `RavProgressionValidator`（保留现有返回语义）；
- `PaymentChannelPayeeClient`
  - 保持 `verifySubRAV()` 对外签名验证职责；
  - `confirmSignedProposal()` 改为转调用 `RavVerificationService.verifyAgainstPending()`；
- `PaymentProcessor`
  - `preProcess()`：
    - 使用 `RavPendingCoordinator` 与 `RavBaselineResolver`；
    - `confirmDeferredPayment()` 内部仅保留“编排调用”逻辑；
  - `settle()`：
    - 计算 `cost` 后，调用 `RavPolicy` 决策与 `RavProposalBuilder.buildProposalSync()`；
  - `persist()`：保持不变，仅最小清理逻辑；

注意：本阶段“不改变任何外部行为”，包括历史 handshake 容忍、错误码、Header 形态等。仅完成职责下沉与代码收敛。

### Phase 2（协议对齐，必要的行为调整）

- 客户端与服务端对齐 `rav-handling.md`：
  - 移除“客户端握手（nonce=0, amount=0）”的发送逻辑；
  - 服务端在 Paid 路由上“即使 cost=0 也返回 unsigned”（若尚未落地，确保策略层强制）；
  - FREE 路由上若 DIDAuth 回退定位到 pending 且缺签名，返回 402；
  - 校验允许 `amount` 持平仅在“已知 cost=0 的连续 RAV”场景（由 `RavPolicy` + `RavProgressionValidator` 协同保证）；
- 调整/新增测试：覆盖 FREE/PAID 切换、`cost=0` 的 paid pre-flight 返回、FREE+pending 缺签名的 402；
- 清理握手遗留分支与指标；
- 客户端持久化仅存 `channelId` 与 `pendingSubRAV`（服务端文档化与端到端测试对齐）。

---

## 7 测试与回归清单

- 单元测试：
  - `RavProgressionValidator`：递增/持平/回退（含边界）
  - `RavVerificationService`：pending 不匹配、签名错误、成功路径
  - `RavBaselineResolver`：有/无 SignedSubRAV、有/无 DIDAuth、多种仓库/链游标
  - `RavPolicy`：FREE/PAID + cost=0/非 0 组合
  - `RavProposalBuilder`：从 signed/cursor 两种 baseline 产出一致的 next unsigned 与 header

- 集成测试（服务端）：
  - FREE 路由：有/无 RAV、存在 pending 但缺签名 → 402；
  - PAID 路由：首次（无 baseline）报错、带 SignedSubRAV 流程、`cost=0` 仍返回 unsigned；
  - pending 优先级：存在 pending 时必须匹配签名；
  - DIDAuth fallback：成功定位与定位失败路径。

- 端到端（与客户端协同）：
  - FREE ↔ PAID 过渡的“首次请求/后续请求”；
  - 恢复流程（Phase 2）：存在链上通道但本地缺状态 → `/recovery`；
  - 多子通道（不同 `vmIdFragment`）并行访问与计费。

---

## 8 风险与兼容性

- 风险：抽象下沉可能导致隐式行为变化（例如默认 `allowSameAccumulated`）；
- 缓解：Phase 1 保持现状行为，所有对外 API/错误码/日志语义不变；
- 兼容：`PaymentProcessor` 的方法签名不变；`HttpPaymentCodec` 的 Header 形态不变；
- 文档：本文件与 `rav-handling.md` 共同作为规范来源，Phase 2 完成后以此为准。

---

## 9 立即可执行的最小工作项（Phase 1）

- [ ] 修正 `SubRAVManager.validate()` 调用链，去除对不存在 `SubRAVValidator.validate` 的依赖；
- [ ] 新建 `src/core/rav/` 六个模块文件与最小实现，`PaymentProcessor` 内部改为“薄编排层”；
- [ ] 将 `confirmDeferredPayment()` 改为转调 `RavVerificationService.verifyAgainstPending()`；
- [ ] 将 `generateSubRAVSync()` 与 `buildFollowUpUnsigned()` 下沉至 `RavProposalBuilder`，旧方法仅做转调；
- [ ] 为新增模块补齐单元测试；
- [ ] 保证现有集成与 E2E 测试全部绿色。

---

通过以上分层与两阶段迁移，RAV 的“生成/验证/检查”能力从**分散耦合**转为**模块化可维护**，在保持兼容的同时，为 Phase 2 的协议一致性落地提供稳定地基。
