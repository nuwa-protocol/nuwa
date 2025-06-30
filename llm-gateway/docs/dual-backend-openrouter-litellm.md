# LLM Gateway 双后端（OpenRouter + LiteLLM）支持方案

> 版本：Draft · 2025-06-30

本方案描述如何让 **Nuwa LLM Gateway** 在保持现有 OpenRouter 代理功能的同时，引入 **LiteLLM Proxy** 作为第二套后端。目标是：

1. **最小侵入** —— 复用现有 DID 认证、日志、Supabase 逻辑。
2. **可插拔** —— 未来可以轻松接入更多 LLM Provider。
3. **平滑迁移** —— 可按路径、Header 或环境变量动态选择后端。

---

## 1. 当前架构回顾

```txt
request → didAuthMiddleware → userInitMiddleware → handleOpenRouterProxy → OpenRouterService → OpenRouter
```

核心只有一个 `OpenRouterService.forwardRequest()`，故抽象 provider 是改造重点。

---

## 2. Provider 抽象

```ts
// src/provider/LLMProvider.ts
export interface LLMProvider {
  /**
   * 统一的转发入口
   */
  forwardRequest(
    apiKey: string,
    path: string,
    method: string,
    data?: any,
    isStream?: boolean
  ): Promise<AxiosResponse | { error: string; status?: number } | null>;

  /** 用户 Key 生命周期，可选实现 */
  createApiKey?(req: CreateApiKeyRequest): Promise<CreateApiKeyResponse | null>;
  deleteApiKey?(hash: string): Promise<boolean>;
}
```

### 已有实现

* `OpenRouterService` ➜ `implements LLMProvider`
* 新增 `LiteLLMService` ➜ `implements LLMProvider`

> LiteLLM 专属逻辑：
> * `baseURL` 指向 `http://litellm-service:4000`（或配置文件）。
> * 子账号可通过 `POST /keys`（需 `MASTER_KEY`）。
> * 成本从响应 Header `x-litellm-response-cost` 读取。

---

## 3. 路由层改造

```ts
// src/routes/llm.ts
const providerSelector = (pathname: string, headers: IncomingHttpHeaders) => {
  // ✨ 方案一：按路径
  if (pathname.startsWith("/openrouter/")) return openrouterProvider;
  if (pathname.startsWith("/litellm/"))   return litellmProvider;

  // ✨ 方案二：按 Header
  if (headers["x-llm-provider"] === "litellm") return litellmProvider;
  return openrouterProvider; // default
};
```

保留原有路由注册逻辑，只是将 `handleOpenRouterProxy` 重命名为 `handleLLMProxy` 并在开头注入 `const provider = providerSelector(...)`。

---

## 4. 用户初始化中间件

```txt
OpenRouter       → createApiKey(name) ⟶ hash
LiteLLM (可选)   → POST /keys         ⟶ id
```

数据库表 `user_api_keys` 建议把 `openrouter_key_hash` 字段重命名为更通用的 `provider_key_id`；新增 `provider` 字段记录具体后端。迁移 SQL 示例如下：

```sql
ALTER TABLE user_api_keys ADD COLUMN provider TEXT DEFAULT 'openrouter';
ALTER TABLE user_api_keys RENAME COLUMN openrouter_key_hash TO provider_key_id;
```

---

## 5. Usage & 计费策略

| 方案 | Gateway 是否解析 usage | 写库字段 |
|------|-------------------------|---------|
| **A. LiteLLM 负责计费** | 否 | `total_cost` 取自响应 Header `x-litellm-response-cost` |
| **B. Gateway 继续记录 token** | 仅保存 prompt/completion_tokens | `total_cost` 仍取 Header，tokens 自己计算 |
| **C. 完全沿用现有逻辑** | 是 | 与 OpenRouter 相同（可能双账套） |

> 推荐 **B**：保留 token 维度以利后续统计，但把金额交给 LiteLLM。

---

## 6. 环境变量

```env
# 选择默认后端：openrouter | litellm
LLM_BACKEND=openrouter

# LiteLLM 相关
LITELLM_BASE_URL=http://litellm-service:4000
LITELLM_MASTER_KEY=sk-...
```

---

## 7. 迁移步骤

1. **拉取最新代码**：包含 `LLMProvider` 抽象与 `LiteLLMService`。
2. **更新数据库**：执行上文 SQL，确保新字段存在。
3. **部署 LiteLLM**：参考 `llm-gateway/litellm/kubernetes.yaml`。
4. **配置环境变量**：设定 `LITELLM_BASE_URL`、`LITELLM_MASTER_KEY`。
5. **灰度发布**：
   * 初期仅将 `/api/v1/litellm/*` 路径走新后端。
   * 观测 `request_logs` 与 LiteLLM Dashboard 中的 usage 是否一致。
6. **全量切换**（可选）：将 `LLM_BACKEND` 设为 `litellm` 并更新文档。

---

## 8. 回滚

若发现问题，只需：

1. 把环境变量 `LLM_BACKEND=openrouter`；
2. 清理 `user_api_keys` 中 provider 为 `litellm` 的记录（不影响 OR）。

---

## 9. 后续扩展

有了 `LLMProvider` 抽象，接入 Bedrock / Ollama / 自托管等只需新增一个 `BedrockService` 并在 `providerSelector` 中暴露即可。

---

*Maintainer*: @nuwa-team 