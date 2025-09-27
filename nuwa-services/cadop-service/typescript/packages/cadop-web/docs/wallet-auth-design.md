# Cadop Web 钱包认证设计方案

> 版本：v1.0  
> 日期：2025-01-19  
> 状态：讨论稿

## 1. 概述

本文档描述了 cadop-web 集成 Rooch 钱包登录功能的设计方案。系统将支持两种认证方式：

1. **Passkey 认证**（现有）- 通过 WebAuthn 标准进行身份验证
2. **钱包认证**（新增）- 通过 Rooch 钱包进行身份验证

### 1.1 核心概念

#### User DID（外部账户）

- **Passkey 方式**：`did:key:xxx` - 基于 WebAuthn 公钥生成
- **钱包方式**：`did:rooch:{address}` - 直接使用钱包地址

#### Agent DID（智能合约账户）

- 无论采用哪种认证方式，Agent DID 都是 Rooch 链上的智能合约账户
- 需要通过链上交易创建
- 一个 User DID 可以创建多个 Agent DID

### 1.2 概念关系图

```
┌─────────────────────────────────────────────────────────────┐
│                         User DID                             │
│                     (外部账户标识)                            │
├───────────────────────────┬─────────────────────────────────┤
│   did:key:xxx (Passkey)   │  did:rooch:address (Wallet)     │
└────────────┬──────────────┴──────────────┬──────────────────┘
             │                              │
             │         创建 Agent           │
             │      (链上智能合约)          │
             ▼                              ▼
   ┌─────────────────────┐       ┌─────────────────────┐
   │   Agent DID #1      │       │   Agent DID #2      │
   │ did:rooch:agent1    │       │ did:rooch:agent2    │
   │ (智能合约账户)       │       │ (智能合约账户)       │
   └─────────────────────┘       └─────────────────────┘
```

### 1.3 核心变化

- 引入统一的认证抽象层，支持多种认证方式
- 钱包登录后，Agent DID 创建通过钱包直接签名交易，不再依赖 cadop-api 服务
- 扩展现有存储结构，支持多种认证方式的账户信息

## 2. 架构设计

### 2.1 认证抽象层

```typescript
// lib/auth/types.ts
export enum AuthMethod {
  PASSKEY = 'passkey',
  WALLET = 'wallet',
}

export interface AuthProvider {
  // 认证方式类型
  type: AuthMethod;

  // 检查是否支持该认证方式
  isSupported(): Promise<boolean>;

  // 执行登录
  login(options?: LoginOptions): Promise<AuthResult>;

  // 执行登出
  logout(): Promise<void>;

  // 获取签名器
  getSigner(): SignerInterface | null;

  // 获取当前用户标识
  getUserIdentifier(): string | null;
}

export interface AuthResult {
  // 用户的 DID
  userDid: string;
  // 认证方式
  method: AuthMethod;
  // 认证凭证标识（如 credentialId 或 walletAddress）
  identifier: string;
  // 是否为新用户
  isNew: boolean;
}

export interface UnifiedSigner extends SignerInterface {
  // 获取认证方式
  getAuthMethod(): AuthMethod;
  // 原有 SignerInterface 的方法...
}
```

### 2.2 认证提供者实现

#### 2.2.1 Passkey Provider

```typescript
// lib/auth/providers/PasskeyAuthProvider.ts
export class PasskeyAuthProvider implements AuthProvider {
  type = AuthMethod.PASSKEY;
  private passkeyService: PasskeyService;

  async login(options?: LoginOptions): Promise<AuthResult> {
    // 现有的 Passkey 登录逻辑
    const userDid = await this.passkeyService.login();
    return {
      userDid,
      method: AuthMethod.PASSKEY,
      identifier: credentialId,
      isNew: false,
    };
  }

  getSigner(): WebAuthnSigner | null {
    // 返回 WebAuthnSigner 实例
  }
}
```

#### 2.2.2 Wallet Provider

```typescript
// lib/auth/providers/WalletAuthProvider.ts
export class WalletAuthProvider implements AuthProvider {
  type = AuthMethod.WALLET;
  private walletClient: WalletClient | null = null;

  async login(options?: LoginOptions): Promise<AuthResult> {
    // 连接钱包（Rooch 钱包是 Bitcoin 钱包）
    await this.connectWallet();

    // 获取钱包地址
    const address = await this.walletClient.getAddress();

    // 查找或创建对应的 DID
    const userDid = await this.findOrCreateDid(address);

    return {
      userDid,
      method: AuthMethod.WALLET,
      identifier: address,
      isNew: !existingDid,
    };
  }

  private async findOrCreateDid(address: string): Promise<string> {
    // 1. 先从本地存储查找
    const existingDid = UserStore.findUserByWalletAddress(address);
    if (existingDid) return existingDid;

    // 2. 钱包方式的 User DID 就是 did:rooch:{address}
    // 这是一个外部账户，不需要链上创建
    const userDid = `did:rooch:${address}`;

    // 3. 保存到本地存储
    UserStore.addWalletUser(userDid, address);

    return userDid;
  }

  getSigner(): RoochWalletSigner | null {
    // 返回基于钱包的签名器
  }
}
```

### 2.3 统一认证上下文

```typescript
// lib/auth/AuthContext.tsx
interface AuthContextType {
  // 当前认证状态
  isAuthenticated: boolean;
  isLoading: boolean;

  // 当前用户信息
  userDid: string | null;
  authMethod: AuthMethod | null;

  // 认证操作
  login(method: AuthMethod, options?: LoginOptions): Promise<void>;
  logout(): void;

  // 获取当前签名器
  getSigner(): UnifiedSigner | null;

  // 切换认证方式
  switchAuthMethod(method: AuthMethod): Promise<void>;
}
```

## 3. 数据存储扩展

### 3.1 存储结构更新

```typescript
// lib/storage/types.ts
interface NuwaState {
  version: number;
  currentUserDid: string | null;
  users: Record<string, UserEntry>;
  // 注意：不需要 walletAddressMap，钱包 DID 格式为 did:rooch:{address}
  // 可以直接通过 DID 格式推断和查找
}

interface UserEntry {
  // 现有字段
  credentials: string[]; // Passkey credentialIds（仅 Passkey 用户）
  agents: string[];
  createdAt: number;
  updatedAt: number;

  // 新增字段：每个 User DID 只有一种认证方式
  authMethod: AuthMethod; // 'passkey' | 'wallet'
  authIdentifier: string; // credentialId 或 address
}
```

### 3.2 存储适配器更新

```typescript
// lib/storage/UserStore.ts
export class UserStore {
  // 新增方法
  static findUserByWalletAddress(address: string): string | null {
    // 直接通过 DID 格式构造和查找
    const targetDid = `did:rooch:${address}`;
    const state = NuwaStore.getState();
    return state.users[targetDid] ? targetDid : null;
  }

  static addWalletUser(userDid: string, address: string): void {
    // 添加钱包用户（userDid 应该等于 `did:rooch:${address}`）
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

  static getAuthMethod(userDid: string): AuthMethod | null {
    // 直接从 DID 格式推断认证方式
    if (userDid.startsWith('did:key:')) return 'passkey';
    if (userDid.startsWith('did:rooch:')) return 'wallet';
    return null;
  }

  // 工具函数：从钱包 DID 提取地址
  static extractAddressFromDID(userDid: string): string | null {
    if (userDid.startsWith('did:rooch:')) {
      return userDid.replace('did:rooch:', '');
    }
    return null;
  }
}
```

## 4. 签名器统一

### 4.1 RoochWalletSigner 实现

```typescript
// lib/auth/RoochWalletSigner.ts
export class RoochWalletSigner implements UnifiedSigner {
  private walletClient: WalletClient;
  private userDid: string;

  async sign(data: Uint8Array): Promise<Uint8Array> {
    // 使用钱包签名
    return await this.walletClient.signMessage(data);
  }

  async signTransaction(tx: Transaction): Promise<Authenticator> {
    // 使用钱包签名交易
    return await this.walletClient.signTransaction(tx);
  }

  getAuthMethod(): AuthMethod {
    return AuthMethod.WALLET;
  }
}
```

## 5. UI/UX 设计

### 5.1 登录页面更新

```tsx
// pages/auth/login.tsx
<LoginPage>
  <Tabs defaultValue="passkey">
    <TabsList>
      <TabsTrigger value="passkey">Passkey</TabsTrigger>
      <TabsTrigger value="wallet">Wallet</TabsTrigger>
    </TabsList>

    <TabsContent value="passkey">
      <PasskeyLogin />
    </TabsContent>

    <TabsContent value="wallet">
      <WalletLogin />
    </TabsContent>
  </Tabs>
</LoginPage>
```

### 5.2 钱包连接组件

```tsx
// components/auth/WalletLogin.tsx
import { ConnectButton } from '@roochnetwork/rooch-sdk-kit';

export function WalletLogin() {
  const { connected, account } = useCurrentAccount();

  const handleLogin = async () => {
    if (!account) return;

    // Rooch 使用 Bitcoin 地址作为账户
    const userDid = `did:rooch:${account.address}`;
    await authContext.login(AuthMethod.WALLET);
  };

  return (
    <div>
      {/* Rooch SDK Kit 提供的钱包连接按钮，支持 UniSat 等 Bitcoin 钱包 */}
      <ConnectButton />
      {connected && <Button onClick={handleLogin}>使用钱包地址登录</Button>}
    </div>
  );
}
```

## 6. Agent DID 创建流程

Agent DID 是 Rooch 链上的智能合约账户，需要通过链上交易创建。两种认证方式的区别在于签名机制：

### 6.1 Passkey 方式（现有）

1. 通过 PasskeyService 获取 idToken（包含 WebAuthn 签名）
2. 调用 cadop-api 的 mint 接口
3. cadop-api 验证签名并发起链上交易
4. 等待链上交易确认，创建智能合约账户

### 6.2 钱包方式（新增）

1. 直接构造创建 Agent DID 的链上交易
2. 使用钱包签名交易
3. 提交交易到 Rooch 网络
4. 等待链上交易确认，创建智能合约账户

```typescript
// lib/agent/WalletAgentService.ts
import { IdentityKit } from '@nuwa-ai/identity-kit';

export class WalletAgentService {
  async createAgent(userDid: string, signer: RoochWalletSigner): Promise<string> {
    // 使用 IdentityKit 创建 Agent DID
    const creationRequest = {
      publicKey: await signer.getPublicKey(),
      // 其他必要的创建参数
    };

    // 创建新的 Agent DID（链上智能合约账户）
    const identityKit = await IdentityKit.createNewDID(
      'rooch', // DID method
      creationRequest,
      signer,
      {
        // 可选参数
      }
    );

    // 获取创建的 Agent DID
    const agentDid = identityKit.getDIDDocument().id;

    // 保存到本地存储
    UserStore.addAgent(userDid, agentDid);

    return agentDid;
  }
}
```

### 6.3 统一的 Agent 管理

```typescript
// lib/agent/AgentService.ts
export class UnifiedAgentService {
  async createAgent(authMethod: AuthMethod, userDid: string): Promise<string> {
    if (authMethod === AuthMethod.PASSKEY) {
      // 使用 cadop-api 创建
      return this.passkeyAgentService.createAgent(userDid);
    } else if (authMethod === AuthMethod.WALLET) {
      // 直接通过钱包签名创建
      return this.walletAgentService.createAgent(userDid);
    }
  }

  async listAgents(userDid: string): Promise<string[]> {
    // 从本地存储获取该用户的所有 Agent DID
    return UserStore.listAgents(userDid);
  }
}
```

## 7. 实施计划

### Phase 1: 基础架构（1-2周）

1. 实现认证抽象层接口
2. 重构现有 Passkey 认证为 Provider 模式
3. 扩展存储结构

### Phase 2: 钱包集成（1-2周）

1. 集成 @roochnetwork/rooch-sdk-kit
2. 实现 WalletAuthProvider
3. 实现 RoochWalletSigner

### Phase 3: UI 更新（1周）

1. 更新登录页面 UI
2. 添加钱包连接组件
3. 更新用户 Dashboard 显示多认证方式

### Phase 4: Agent 创建（1周）

1. 实现钱包方式的 Agent 创建
2. 统一两种方式的创建流程
3. 测试和优化

## 8. 兼容性考虑

1. **向后兼容**：确保现有 Passkey 用户不受影响
2. **数据迁移**：自动迁移旧版存储结构
3. **多认证支持**：同一用户可以绑定多种认证方式

## 9. 安全考虑

1. **钱包签名验证**：确保签名的有效性
2. **DID 唯一性**：防止同一钱包地址创建多个 DID
3. **会话管理**：钱包断开连接时的处理

## 10. 扩展性

未来可以支持更多认证方式：

- 其他区块链钱包（MetaMask、Sui Wallet 等）
- OAuth2（Google、GitHub 等）
- 硬件钱包

## 11. 设计决策

基于讨论，以下是关键决策：

1. **Agent 创建方式**
   - 使用 `IdentityKit.createNewDID` 方法创建 Agent DID
   - 钱包用户直接调用该方法，无需通过 cadop-api

2. **多链支持**
   - 当前 Rooch 钱包即是 Bitcoin 钱包
   - Ethereum 支持留待未来考虑

3. **Agent 权限**
   - 钱包创建的 Agent 与 Passkey 创建的 Agent 在权限上无差异
   - 两种方式创建的都是标准的智能合约账户

4. **独立性设计**
   - Agent DID 创建后是独立账户
   - 与创建者（controller）解耦，具有完全的自主权

5. **Session Key**
   - 暂不考虑为钱包用户生成 Session Key
   - 未来可根据需要添加此功能

---

## 附录

### A. 依赖包

```json
{
  "@roochnetwork/rooch-sdk-kit": "^0.3.x", // 提供 Bitcoin 钱包连接支持
  "@tanstack/react-query": "^5.x.x",
  "@nuwa-ai/identity-kit": "^0.5.x" // 用于创建 Agent DID
}
```

### B. 参考资料

- [Rooch SDK Kit 文档](https://github.com/roochnetwork/rooch/tree/main/sdk/typescript/rooch-sdk-kit)
- [React Counter 示例](deps/rooch/sdk/typescript/templates/react-counter)
