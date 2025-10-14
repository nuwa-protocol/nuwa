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

> **推荐：Header 路由**
>
> 使用自定义 Header `X-LLM-Provider`（不区分大小写）声明具体后端，默认为 `openrouter`。这样可保持统一的 RESTful 路径 `/api/v1/*`，避免在业务代码中出现 `/openrouter/`、`/litellm/` 等冗余前缀。

```ts
// src/routes/llm.ts
const providerSelector = (headers: IncomingHttpHeaders) => {
  const provider = (headers["x-llm-provider"] as string | undefined)?.toLowerCase();
  if (provider === "litellm") return litellmProvider;
  return openrouterProvider; // 默认走 OpenRouter
};

// 路由注册保持 /api/v1/* 不变
router.all("/*", didAuthMiddleware, async (req, res) => {
  const provider = providerSelector(req.headers);
  return handleLLMProxy(req, res, provider);
});
```

### 兼容旧客户端
1. 若客户端没有携带 `X-LLM-Provider`，网关会按 `LLM_BACKEND` 环境变量 (`openrouter` / `litellm`) 作为默认。
2. 如需灰度，可在 Nginx / API Gateway 层按百分比注入 Header，或让前端在实验功能中添加 Header。

> 如仍想用显式路径，可采用 `/openrouter/api/v1/*` 或 `/litellm/api/v1/*` 方案。但需要额外维护两个前缀，文档、SDK、监控都要更新，不够优雅。综合考虑，**Header 方案更简洁**，后续新增 Provider 也只需扩展 Header 值。

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

#### 字段重命名兼容方案

为了实现**零停机/零回滚风险**的平滑迁移，需让旧代码依旧可用 `openrouter_key_hash` 字段，而新代码全面使用 `provider_key_id`。以下提供三种常见做法，按复杂度由低到高排序，可按实际情况选择。

| 方案 | 读写能力 | 重点 SQL/DDL | 适用场景 |
|------|----------|--------------|-----------|
| **① 双字段 + 触发器**（推荐） | 读写 **双向同步** | `BEFORE INSERT/UPDATE` 触发器 | 旧代码仍会写入老字段 |
| ② 生成列（Generated Column） | 旧字段**只读**，新字段可写 | `GENERATED ALWAYS AS` | 旧字段只读即可 |
| ③ 表重命名 + VIEW + INSTEAD OF 触发器 | 兼容读写 | 创建同名视图 | 想彻底隔离、可接受改名 |

---
##### ① 双字段 + 触发器（推荐）
```sql
-- 1) 新增字段
ALTER TABLE user_api_keys ADD COLUMN provider_key_id TEXT;

-- 2) 同步历史数据
UPDATE user_api_keys
SET    provider_key_id = openrouter_key_hash
WHERE  provider_key_id IS NULL;

-- 3) 创建触发器，保持两个字段一致
CREATE OR REPLACE FUNCTION sync_user_api_keys() RETURNS TRIGGER AS $$
BEGIN
    IF NEW.openrouter_key_hash IS NOT NULL THEN
        NEW.provider_key_id := NEW.openrouter_key_hash;
    ELSIF NEW.provider_key_id IS NOT NULL THEN
        NEW.openrouter_key_hash := NEW.provider_key_id;
    END IF;
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_sync_user_api_keys ON user_api_keys;
CREATE TRIGGER trg_sync_user_api_keys
BEFORE INSERT OR UPDATE ON user_api_keys
FOR EACH ROW EXECUTE FUNCTION sync_user_api_keys();
```
实施后：
1. 旧代码依旧 `SELECT/INSERT/UPDATE openrouter_key_hash`，数据会自动同步。
2. 新代码仅操作 `provider_key_id`。
3. 所有线上流量无需感知。

当旧代码全部下线后，可**安全删除**旧字段与触发器：
```sql
ALTER TABLE user_api_keys DROP COLUMN openrouter_key_hash;
DROP TRIGGER trg_sync_user_api_keys ON user_api_keys;
DROP FUNCTION sync_user_api_keys();
```

---
##### ② 生成列（只读别名）
只在 PostgreSQL ≥ 12 或 MySQL ≥ 5.7，并且旧代码**不会写入**该字段时可用。

```sql
ALTER TABLE user_api_keys ADD COLUMN provider_key_id TEXT;
-- 迁移旧数据
UPDATE user_api_keys
SET    provider_key_id = openrouter_key_hash
WHERE  provider_key_id IS NULL;

-- 删除旧字段并以生成列重建，使其映射到新列（Postgres 做法）
ALTER TABLE user_api_keys DROP COLUMN openrouter_key_hash;
ALTER TABLE user_api_keys ADD COLUMN openrouter_key_hash TEXT GENERATED ALWAYS AS (provider_key_id) STORED;
```

---
##### ③ 表重命名 + 同名 VIEW
```sql
ALTER TABLE user_api_keys RENAME TO user_api_keys_v2;

CREATE VIEW user_api_keys AS
SELECT *, provider_key_id AS openrouter_key_hash
FROM   user_api_keys_v2;

-- 如需写入，在 VIEW 上加 INSTEAD OF 触发器同步到 v2 表
```

此方案可彻底隔离老新逻辑，但部署、权限及 ORMs 连接需重新配置。

> **总结**：大多数场景下，*双字段 + 触发器* 即可满足平滑迁移需求，实施简单、回滚方便。

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