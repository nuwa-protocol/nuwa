# Cadop Web 重构计划 - 支持钱包认证

> 版本：v1.0  
> 日期：2025-01-19  
> 状态：实施准备

## 1. 概述

基于现有代码分析，本文档列出了支持钱包认证所需的预先重构工作。这些重构将使代码库更加模块化，便于添加新的认证方式。

## 2. 重构需求分析

### 2.1 认证层重构

#### 现状

- `AuthContext` 紧耦合于 Passkey 认证
- `PasskeyService` 直接被多个组件使用
- 没有统一的认证抽象

#### 重构目标

- 创建 `AuthProvider` 接口
- 将 `PasskeyService` 封装为 `PasskeyAuthProvider`
- 扩展 `AuthContext` 支持多种认证方式

#### 具体改动

```typescript
// 1. 创建新文件：lib/auth/providers/types.ts
export interface AuthProvider {
  type: AuthMethod;
  isSupported(): Promise<boolean>;
  login(options?: LoginOptions): Promise<AuthResult>;
  logout(): Promise<void>;
  getSigner(): SignerInterface | null;
  getUserIdentifier(): string | null;
}

// 2. 重构 AuthContext 类型
interface AuthContextType {
  // 现有字段
  isAuthenticated: boolean;
  isLoading: boolean;
  userDid: string | null;
  error: string | null;

  // 新增字段
  authMethod: AuthMethod | null;

  // 重构方法
  login(method: AuthMethod, options?: LoginOptions): Promise<void>;
  logout(): void;
  getSigner(): UnifiedSigner | null;
}

// 3. 将 PasskeyService 包装为 Provider
class PasskeyAuthProvider implements AuthProvider {
  private passkeyService: PasskeyService;
  // 实现 AuthProvider 接口
}
```

### 2.2 存储层重构

#### 现状

- 存储结构仅支持 Passkey（credentials 数组）
- 没有版本迁移机制
- 缺少多认证方式支持

#### 重构目标

- 扩展存储结构支持多种认证方式
- 实现版本迁移（v1 -> v2）
- 添加钱包地址查找功能

#### 具体改动

```typescript
// 1. 扩展 NuwaState 和 UserEntry
interface NuwaState {
  version: number;
  currentUserDid: string | null;
  users: Record<string, UserEntry>;
  // 注意：不需要 walletAddressMap，因为钱包 DID 格式为 did:rooch:{address}
  // 可以直接通过 `did:rooch:${address}` 构造 DID 并查找
}

interface UserEntry {
  credentials: string[]; // 仅 Passkey 用户有此字段
  agents: string[];
  createdAt: number;
  updatedAt: number;
  authMethods: AuthMethodInfo[]; // 新增
}

interface AuthMethodInfo {
  method: AuthMethod;
  identifier: string;
  addedAt: number;
}

// 2. 实现版本迁移
class StorageMigration {
  static migrateV1ToV2(v1State: NuwaStateV1): NuwaStateV2 {
    const v2State: NuwaStateV2 = {
      version: 2,
      currentUserDid: v1State.currentUserDid,
      users: {},
    };

    // 迁移现有用户（都是 Passkey 用户）
    for (const [userDid, userEntry] of Object.entries(v1State.users)) {
      v2State.users[userDid] = {
        ...userEntry,
        authMethod: 'passkey',
        authIdentifier: userEntry.credentials[0] || '', // 使用第一个 credential
      };
    }

    return v2State;
  }
}

// 3. 扩展 UserStore - 简化后的 API
class UserStore {
  // 通过钱包地址查找用户 DID
  static findUserByWalletAddress(address: string): string | null {
    const targetDid = `did:rooch:${address}`;
    const state = NuwaStore.getState();
    return state.users[targetDid] ? targetDid : null;
  }

  // 添加钱包用户
  static addWalletUser(userDid: string, address: string): void {
    // userDid 应该等于 `did:rooch:${address}`
    const state = NuwaStore.getState();
    state.users[userDid] = {
      credentials: [], // 钱包用户无 credentials
      agents: [],
      createdAt: Date.now(),
      updatedAt: Date.now(),
      authMethod: 'wallet',
      authIdentifier: address,
    };
    NuwaStore.saveState(state);
  }

  // 获取用户认证方式
  static getAuthMethod(userDid: string): AuthMethod | null {
    if (userDid.startsWith('did:key:')) return 'passkey';
    if (userDid.startsWith('did:rooch:')) return 'wallet';
    return null;
  }
}
```

### 2.3 签名器层重构

#### 现状

- `DIDService` 硬编码使用 `WebAuthnSigner`
- 没有统一的签名器接口实现

#### 重构目标

- 创建签名器工厂模式
- 支持根据认证方式创建不同签名器

#### 具体改动

```typescript
// 1. 创建签名器工厂
class SignerFactory {
  static createSigner(
    authMethod: AuthMethod,
    did: string,
    options: SignerOptions
  ): SignerInterface {
    switch (authMethod) {
      case AuthMethod.PASSKEY:
        return new WebAuthnSigner(did, options);
      case AuthMethod.WALLET:
        return new RoochWalletSigner(did, options);
      default:
        throw new Error(`Unsupported auth method: ${authMethod}`);
    }
  }
}

// 2. 重构 DIDService.initialize
static async initialize(
  did: string,
  authMethod: AuthMethod,
  signerOptions?: any
): Promise<DIDService> {
  // 使用工厂创建签名器
  const signer = SignerFactory.createSigner(authMethod, did, signerOptions);
  // ...
}
```

### 2.4 Agent 服务重构

#### 现状

- `AgentService` 耦合于 Passkey（通过 getIdToken）
- 创建流程不支持其他认证方式

#### 重构目标

- 拆分为 `PasskeyAgentService` 和 `WalletAgentService`
- 创建统一的 `AgentServiceInterface`

#### 具体改动

```typescript
// 1. 创建接口
interface AgentServiceInterface {
  createAgent(userDid: string, options?: any): Promise<AgentDIDCreationStatus>;
  listAgents(userDid: string): string[];
}

// 2. 拆分现有 AgentService
class PasskeyAgentService implements AgentServiceInterface {
  // 现有的基于 idToken 的实现
}

class WalletAgentService implements AgentServiceInterface {
  // 新的基于 IdentityKit 的实现
}

// 3. 创建工厂或统一入口
class AgentServiceFactory {
  static getService(authMethod: AuthMethod): AgentServiceInterface {
    // 根据认证方式返回对应服务
  }
}
```

## 3. 重构步骤

### Step 1: 存储层重构（优先级：高）

1. 备份现有存储结构
2. 实现版本迁移逻辑
3. 扩展 UserStore API
4. 测试数据迁移

### Step 2: 认证抽象层（优先级：高）

1. 创建 AuthProvider 接口
2. 实现 PasskeyAuthProvider
3. 重构 AuthContext
4. 更新所有使用 AuthContext 的组件

### Step 3: 签名器工厂（优先级：中）

1. 创建 SignerFactory
2. 重构 DIDService
3. 更新相关调用

### Step 4: Agent 服务拆分（优先级：中）

1. 创建 AgentServiceInterface
2. 拆分现有 AgentService
3. 更新调用点

## 4. 风险评估

### 高风险

- **数据迁移失败**：可能导致用户无法登录
  - 缓解：实现回滚机制，保留原始数据备份

### 中风险

- **组件兼容性**：重构可能影响现有功能
  - 缓解：充分的单元测试和集成测试

### 低风险

- **性能影响**：新的抽象层可能略微影响性能
  - 缓解：性能测试和优化

## 5. 测试策略

1. **单元测试**
   - 所有新的 Provider 和 Service 类
   - 存储迁移逻辑
   - 签名器工厂

2. **集成测试**
   - 完整的登录流程（Passkey）
   - Agent 创建流程
   - 数据迁移场景

3. **兼容性测试**
   - 确保现有 Passkey 用户不受影响
   - 测试各种边界情况

## 6. 时间估算

| 任务           | 预估时间 | 依赖   |
| -------------- | -------- | ------ |
| 存储层重构     | 2-3 天   | 无     |
| 认证抽象层     | 3-4 天   | 存储层 |
| 签名器工厂     | 1-2 天   | 认证层 |
| Agent 服务拆分 | 2-3 天   | 签名器 |
| 测试和修复     | 2-3 天   | 所有   |

**总计：10-15 天**

## 7. 向后兼容性保证

1. **存储兼容**：自动迁移 v1 数据到 v2
2. **API 兼容**：保持现有公共 API 不变
3. **行为兼容**：现有 Passkey 流程保持不变

## 8. 代码示例

### 存储迁移示例

```typescript
// lib/storage/migrations/v1-to-v2.ts
export function migrateV1ToV2(v1State: any): NuwaStateV2 {
  const v2State: NuwaStateV2 = {
    version: 2,
    currentUserDid: v1State.currentUserDid,
    currentAuthMethod: v1State.currentUserDid ? AuthMethod.PASSKEY : null,
    users: {},
  };

  // 迁移用户数据
  for (const [did, user] of Object.entries(v1State.users)) {
    v2State.users[did] = {
      ...user,
      authMethods: user.credentials.map(cred => ({
        method: AuthMethod.PASSKEY,
        identifier: cred,
        addedAt: user.createdAt,
      })),
    };
  }

  return v2State;
}
```

### 认证流程示例

```typescript
// 新的统一登录流程
async function login(method: AuthMethod) {
  const provider = AuthProviderFactory.create(method);
  const result = await provider.login();

  if (result.isNew) {
    navigate('/onboarding');
  } else {
    navigate('/dashboard');
  }
}
```
