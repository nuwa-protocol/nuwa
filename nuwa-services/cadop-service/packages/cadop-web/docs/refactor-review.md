# CADOP-Web 最终重构评审报告

> 版本：v1  日期：2025-06-24
>
> 本文档总结了对 `nuwa-services/cadop-service/packages/cadop-web` 代码库的最终 Review 结果，聚焦于 **"精简、去重复、模块抽取"** 三大目标，为后续 PR 及版本迭代提供指南。

---

## 1 可裁撤（删除或迁移）的冗余模块

| 类别        | 文件 / 目录                                                                                                         | 说明                                                             |
| ----------- | ------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------- |
| UI 组件     | `components/ui/did-display.tsx`                                                                                     | 未被任何页面引用，可直接删除。                                   |
| UI 组件     | `components/ui/step-indicator.tsx`<br/>`components/ui/sybil-level.tsx`<br/>`components/ui/auth-method-selector.tsx` | 目前零引用，后续若需可从 Git 记录恢复。                          |
| Layout      | `components/layout/Header.tsx`                                                                                      | 本包未用，仅 website 子站使用，建议迁移或合并到 `MainLayout`。   |
| Re-export   | `components/ui/index.ts`                                                                                            | 重复转出 Antd / Radix 组件，生产代码已直接使用包名导入，可删除。 |
| 调试 & 文档 | `pages/webauthn-debug.tsx`<br/>`lib/auth/README-webauthn-testing.md`                                                | 属于手动测试工具，建议移动到 `examples/`。                       |
| Util 重复   | `lib/utils.ts` 的 `cn()`                                                                                            | 该 util 多处重复实现，保留单一公共版本。                         |

> 预估减脂：**≈ 9 个文件 / 1 500+ 行**

---

## 2 重复代码重构与复用

1. **DID 组件族统一**  
   `DIDDisplayCard`, `DIDDisplay`, `ui/did-display.tsx` 三者功能重叠，可通过可选 `variant` / `compact` props 收敛为单组件。
2. **Rooch RPC Client 单例**  
   `new RoochClient({ url: ROOCH_RPC_URL })` 分散在多个文件，抽象 `lib/rooch/client.ts` 单例，集中错误处理与重连逻辑。
3. **异步步骤壳组件**  
   `CreatePasskeyStep`, `CreateAgentStep`, `ClaimGasStep`, `WebAuthnLogin` 均含「加载 → 成功 → 失败 / 重试」模式，可提炼 `AsyncStepShell` 以减少模板代码。
4. **Layout Header 合并**  
   `MainLayout` 与独立 `Header` 组件存在重复，二选一统一。
5. **Base64 / ArrayBuffer Util 抽离**  
   `arrayBufferToBase64URL` 等方法应迁至公共 crypto util，避免在 `PasskeyService` 内重复实现。

---

## 3 可迁移到 @/identity-kit / @/identity-kit-web 的通用能力

| 模块                                                       | 目标包                    | 抽取理由                                                |
| ---------------------------------------------------------- | ------------------------- | ------------------------------------------------------- |
| `lib/passkey/PasskeyService.ts`                            | identity-kit-web          | 纯浏览器 WebAuthn 流程，无 UI 依赖。                    |
| `NuwaStore` / `AuthStore` / `UserStore` & `StorageAdapter` | identity-kit-web          | 通用身份本地存储，无框架耦合。                          |
| `lib/agent/AgentService.ts`                                | 新包 `@nuwa-ai/cadop-sdk` | Custodian mint & status 轮询可供多前端复用。            |
| DeepLink / Add-Key 流程（现已在 identity-kit-web 存在）    | 保留单实现                | 删除 cadop-web 重复逻辑，直接 import。                  |
| DID ↔ Rooch Address helper                                 | identity-kit              | 放入 `didUtil.getRoochAddressFromDid()`，统一解析方式。 |

---

## 4 架构与风格额外建议

1. **UI 库统一**  
   目前并用 Ant Design + shadcn/ui，建议二选一，以减少 bundle 体积与样式冲突。
2. **全局状态同步**  
   建议改用 Zustand 或监听 `storage` 事件，保证多 Tab 登录状态一致性。
3. **生产日志精简**  
   移除 `console.debug`、`console.log`，或用自定义 Logger 并在 prod 级别禁用。
4. **TypeScript 严格模式**  
   启用 `strict`、`noUncheckedIndexedAccess` 并处理 `any`，提升类型安全。

---

## 5 典型重构任务拆分（Roadmap）

| Task                          | 主要改动                  | 依赖风险 | 归属包                   |
| ----------------------------- | ------------------------- | -------- | ------------------------ |
| 删除未用组件文件              | 9 文件                    | 低       | cadop-web                |
| 合并 DID 组件                 | `components/did`          | 低       | cadop-web                |
| RoochClient 单例              | 2 文件 → `lib/rooch`      | 低       | cadop-web / identity-kit |
| 抽取 PasskeyService + Storage | 新目录 `identity-kit-web` | 中       | identity-kit-web         |
| SDK 化 AgentService           | 新包 `@nuwa-ai/cadop-sdk` | 中       | cadop-sdk                |
| UI 库统一                     | 全局                      | 中-高    | cadop-web                |

---

## 6 预期收益

- **代码量减少** 20-30%，加快 CI / 打包速度。
- **依赖树更清晰**，身份与链交互能力独立包，可在其它前端复用。
- **维护成本降低**：统一 UI / Util 后，未来改动影响面可预测。
- **性能提升**：去掉未用依赖（Antd 或 shadcn 其一）后，初次加载体积可减少数百 KB gzip。

---

### 附：实施顺序建议

1. **删除未用文件**（零风险，先行）。
2. **抽取通用模块**（Passkey & Storage → identity-kit-web）。
3. **SDK 化 AgentService**，并在 cadop-web 适配。
4. **UI 组件合并 / UI 库统一**。
5. 最后在 CI 引入 **bundle-size check**，确保后续 PR 不回归臃肿。

> 如有问题或新发现，请在对应 PR 里引用本文件并补充。
