# Cadop Web 本地存储方案（v1）

> 说明：本文档针对 `cadop-web` 前端在浏览器侧的本地持久化方案进行设计说明，涵盖数据结构、读写 API、迁移与扩展策略。代码示例均使用 TypeScript，存储介质以 `localStorage` 为例。

---

## 1. 设计目标

1. **集中管理** —— 所有身份、代理等信息统一存放，方便迁移与清理。
2. **多身份支持** —— 一个浏览器可保存多个 **userDID** 及其各自数据，支持在多把 Passkey 间切换而不丢失旧数据。
3. **轻量会话** —— 仅保存「当前选中的 userDID」，不持久化短生命周期的 `idToken`。
4. **可版本化** —— 通过顶层 `version` 字段为未来升级保留空间。
5. **易扩展** —— 后续可切换到 IndexedDB、加密存储或云同步，而不影响上层业务代码。

---

## 2. 顶层 Key 与版本管理

- 仅使用一个顶层 key：`nuwa:v1`。
- 值为一个 JSON 字符串，内部包含 `version` 字段（目前为 `1`）。
- 若未来结构变动，使用 `nuwa:v2` 并提供迁移函数。

---

## 3. 数据结构（v1）

```jsonc
{
  "version": 1,
  "currentUserDid": "did:key:z6Mk…", // ← 当前登录用户，无则视为未登录
  "users": {
    "did:key:z6Mk…": {
      "credentials": [
        "credId-1", // WebAuthn credentialId
        "credId-2",
      ],
      "agents": [
        "did:rooch:abc", // agentDID
        "did:rooch:def",
      ],
      "createdAt": 1690000000, // Unix epoch (秒)
      "updatedAt": 1690001234,
    },
    // … 其他 userDID
  },
}
```

> ⚠️ **未保存 `idToken`**：`AgentService.getIdToken()` 每次向后端重新申请，一次性使用后即丢弃。

### 补充说明：为什么 `credentials` 仍使用数组？

- WebAuthn 规范并未保证"同一把公钥 ⇔ 唯一 credentialId"。平台验证器可能在再次注册时生成新的 `credentialId`，或在系统重置、设备同步后出现不同的 `credentialId`。
- 用户可能在多台设备导入同一 Passkey，或同时拥有平台 Passkey 与外接 FIDO2 Token。
- 因此保留 `credentials: string[]` 可兼容上述场景；业务层若目前只需第一项，可在 `UserStore.listCredentials(userDid)[0]` 取用即可。

---

## 4. 本地数据丢失与备份

由于本应用**完全离线**、不依赖后端持久化，一旦浏览器的 `localStorage`（或未来替换的存储介质）被用户清除，将面临不可逆后果：

1. WebAuthn 登录响应里不包含公钥，客户端无法重新计算 `userDid`。
2. 即便保留了 Passkey，缺失 `userDid ↔ credentialId` 映射后也无法继续使用已创建的 Agent。

推荐的预防措施：

- 提供「导出身份数据」功能，把 `nuwa:v1` JSON 手动保存；
- 或申请 `navigator.storage.persist()` 以降低被浏览器垃圾回收的概率；
- 若用户确实丢失数据，只能重新注册 Passkey，生成新的 `userDid` 并重新创建 Agent。

---

## 5. 关键 API

封装三层：

### 5.1 StorageAdapter（最低层）

```ts
interface StorageAdapter {
  getRaw(): string | null;
  setRaw(value: string): void;
  clear(): void;
}
```

- 默认实现直接调用 `window.localStorage`。
- 将来可替换为 IndexedDB、加密存储等。

### 5.2 NuwaStore（核心状态）

```ts
interface NuwaState {
  version: 1;
  currentUserDid: string | null;
  users: Record<string, UserEntry>; // key = userDid
}

interface UserEntry {
  credentials: string[]; // credentialId list
  agents: string[]; // agentDID list
  createdAt: number;
  updatedAt: number;
}
```

公开方法示例：

```ts
class NuwaStore {
  // 读取状态（不存在则返回默认空结构）
  static getState(): NuwaState { … }

  // 覆写并保存
  static saveState(state: NuwaState): void { … }
}
```

### 5.3 业务 Facade

```ts
class AuthStore {
  static getCurrentUserDid(): string | null { … }
  static setCurrentUserDid(did: string): void { … }
  static clearCurrentUser(): void { … }
}

class UserStore {
  static addCredential(userDid: string, credentialId: string): void { … }
  static addAgent(userDid: string, agentDid: string): void { … }
  static listAgents(userDid: string): string[] { … }
  static listCredentials(userDid: string): string[] { … }
  static getAllUsers(): string[] { … }
}
```

> 所有写操作都应更新对应 `UserEntry.updatedAt`。

---

## 6. 工作流程示例

```ts
// ① Passkey 注册成功后
UserStore.addCredential(userDid, credentialId);
AuthStore.setCurrentUserDid(userDid);

// ② Mint agent 成功后
UserStore.addAgent(userDid, agentDid);

// ③ 页面初始化检查登录状态
const did = AuthStore.getCurrentUserDid();
if (!did) {
  redirectToLogin();
}

// ④ 用户点击登出
AuthStore.clearCurrentUser();
```

---

## 7. 迁移策略

当版本迭代到 `nuwa:v2` 或需要从早期测试版本迁移时，可再引入迁移函数，例如 `migrateV1ToV2()`。

---

## 8. 扩展方向

1. **存储介质**：实现新的 `StorageAdapter`，即可切换到 IndexedDB 或加密存储。
2. **数据加密**：在 Adapter 层对 `setRaw/getRaw` 做加解密处理。
3. **多设备同步**：给 `UserEntry` 增加 `syncedAt`、`pendingOps`，配合后台 API 实现离线队列。
4. **版本升级**：读取时若检测到 `state.version !== 1`，自动调用对应迁移函数。

---

如需修改请在 PR 中更新此文档。
