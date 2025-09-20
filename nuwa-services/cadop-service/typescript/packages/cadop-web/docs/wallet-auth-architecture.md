# Cadop Web 钱包认证架构图

## DID 体系架构

```mermaid
graph TB
    subgraph "External Accounts (User DID)"
        PasskeyDID["did:key:xxx<br/>(Passkey Generated)"]
        WalletDID["did:rooch:0x123...<br/>(Wallet Address)"]
    end

    subgraph "Smart Contract Accounts (Agent DID)"
        Agent1["did:rooch:agent1<br/>(Contract Account)"]
        Agent2["did:rooch:agent2<br/>(Contract Account)"]
        Agent3["did:rooch:agent3<br/>(Contract Account)"]
    end

    subgraph "Rooch Blockchain"
        Contract1["Smart Contract<br/>0xabc..."]
        Contract2["Smart Contract<br/>0xdef..."]
        Contract3["Smart Contract<br/>0x456..."]
    end

    PasskeyDID -->|Create via CADOP API| Agent1
    PasskeyDID -->|Create via CADOP API| Agent2
    WalletDID -->|Create via Direct TX| Agent3

    Agent1 -.->|Deployed as| Contract1
    Agent2 -.->|Deployed as| Contract2
    Agent3 -.->|Deployed as| Contract3

    style PasskeyDID fill:#e1f5fe
    style WalletDID fill:#fff3e0
    style Agent1 fill:#c8e6c9
    style Agent2 fill:#c8e6c9
    style Agent3 fill:#c8e6c9
```

## 模块依赖关系

```mermaid
graph TB
    subgraph "UI Layer"
        LoginPage[Login Page]
        Dashboard[Dashboard]
        OnboardingGuard[Onboarding Guard]
    end

    subgraph "Auth Layer"
        AuthContext[Auth Context]
        AuthProvider[Auth Provider Interface]
        PasskeyProvider[Passkey Provider]
        WalletProvider[Wallet Provider]
    end

    subgraph "Signer Layer"
        SignerInterface[Signer Interface]
        WebAuthnSigner[WebAuthn Signer]
        RoochWalletSigner[Rooch Wallet Signer]
    end

    subgraph "Service Layer"
        AgentService[Agent Service]
        PasskeyAgentService[Passkey Agent Service]
        WalletAgentService[Wallet Agent Service]
        DIDService[DID Service]
    end

    subgraph "Storage Layer"
        NuwaStore[Nuwa Store]
        UserStore[User Store]
        AuthStore[Auth Store]
    end

    subgraph "External Dependencies"
        RoochSDKKit[Rooch SDK Kit]
        WebAuthnAPI[WebAuthn API]
        CadopAPI[Cadop API]
        RoochNetwork[Rooch Network]
    end

    LoginPage --> AuthContext
    Dashboard --> AuthContext
    OnboardingGuard --> AuthContext

    AuthContext --> AuthProvider
    AuthProvider <|-- PasskeyProvider
    AuthProvider <|-- WalletProvider

    PasskeyProvider --> WebAuthnSigner
    WalletProvider --> RoochWalletSigner

    WebAuthnSigner --> SignerInterface
    RoochWalletSigner --> SignerInterface

    AuthContext --> AgentService
    AgentService <|-- PasskeyAgentService
    AgentService <|-- WalletAgentService

    PasskeyAgentService --> CadopAPI
    WalletAgentService --> RoochNetwork

    PasskeyProvider --> WebAuthnAPI
    WalletProvider --> RoochSDKKit

    AuthContext --> Storage Layer
    PasskeyProvider --> Storage Layer
    WalletProvider --> Storage Layer

    DIDService --> SignerInterface
```

## 认证流程对比

### Passkey 认证流程

```mermaid
sequenceDiagram
    participant User
    participant UI
    participant PasskeyProvider
    participant WebAuthn
    participant LocalStorage
    participant CadopAPI
    participant RoochChain

    User->>UI: 点击 Passkey 登录
    UI->>PasskeyProvider: login()
    PasskeyProvider->>WebAuthn: navigator.credentials.get()
    WebAuthn-->>User: 弹出认证提示
    User->>WebAuthn: 确认认证
    WebAuthn-->>PasskeyProvider: 返回 assertion
    PasskeyProvider->>LocalStorage: 查找 credentialId 对应的 userDid
    LocalStorage-->>PasskeyProvider: 返回 userDid (did:key:xxx)
    PasskeyProvider-->>UI: 登录成功

    Note over UI: 创建 Agent DID 流程（链上智能合约）
    UI->>PasskeyProvider: 获取 idToken
    PasskeyProvider->>WebAuthn: 签名挑战
    WebAuthn-->>PasskeyProvider: 返回签名
    PasskeyProvider->>CadopAPI: mint(idToken, userDid)
    CadopAPI->>RoochChain: 创建智能合约账户
    RoochChain-->>CadopAPI: 返回 Agent 地址
    CadopAPI-->>PasskeyProvider: 返回 Agent DID
```

### 钱包认证流程

```mermaid
sequenceDiagram
    participant User
    participant UI
    participant WalletProvider
    participant RoochWallet
    participant LocalStorage
    participant RoochChain

    User->>UI: 点击钱包登录
    UI->>WalletProvider: login()
    WalletProvider->>RoochWallet: connect()
    RoochWallet-->>User: 弹出连接请求
    User->>RoochWallet: 确认连接
    RoochWallet-->>WalletProvider: 返回 address
    WalletProvider->>LocalStorage: 保存 userDid
    Note right of WalletProvider: userDid = did:rooch:{address}
    LocalStorage-->>WalletProvider: 确认保存
    WalletProvider-->>UI: 登录成功

    Note over UI: 创建 Agent DID 流程（链上智能合约）
    UI->>WalletProvider: createAgent(userDid)
    WalletProvider->>RoochWallet: 构造创建合约交易
    RoochWallet-->>User: 弹出签名请求
    User->>RoochWallet: 确认签名
    RoochWallet-->>WalletProvider: 返回已签名交易
    WalletProvider->>RoochChain: 提交交易创建智能合约
    RoochChain-->>WalletProvider: 返回 Agent 地址
    Note right of WalletProvider: Agent DID = did:rooch:{agentAddress}
    WalletProvider-->>UI: 返回 Agent DID
```

## 数据流转

```mermaid
graph LR
    subgraph "用户输入"
        PasskeyAuth[Passkey 认证]
        WalletAuth[钱包连接]
    end

    subgraph "认证处理"
        AuthProvider[统一认证接口]
        PasskeyImpl[Passkey 实现]
        WalletImpl[钱包实现]
    end

    subgraph "身份标识"
        UserDID[User DID]
        CredentialID[Credential ID]
        WalletAddress[Wallet Address]
    end

    subgraph "签名能力"
        Signer[统一签名接口]
        WebAuthnSign[WebAuthn 签名]
        WalletSign[钱包签名]
    end

    subgraph "链上操作"
        AgentCreation[创建 Agent]
        KeyManagement[密钥管理]
        Transaction[交易执行]
    end

    PasskeyAuth --> PasskeyImpl
    WalletAuth --> WalletImpl

    PasskeyImpl --> AuthProvider
    WalletImpl --> AuthProvider

    AuthProvider --> UserDID
    PasskeyImpl --> CredentialID
    WalletImpl --> WalletAddress

    UserDID --> Signer
    CredentialID --> WebAuthnSign
    WalletAddress --> WalletSign

    WebAuthnSign --> Signer
    WalletSign --> Signer

    Signer --> AgentCreation
    Signer --> KeyManagement
    Signer --> Transaction
```

## 存储结构演进

### 当前结构 (v1)

```json
{
  "version": 1,
  "currentUserDid": "did:key:xxx",
  "users": {
    "did:key:xxx": {
      "credentials": ["credId1", "credId2"],
      "agents": ["did:rooch:agent1"],
      "createdAt": 1234567890,
      "updatedAt": 1234567890
    }
  }
}
```

### 新结构 (v2)

```json
{
  "version": 2,
  "currentUserDid": "did:rooch:0x123",
  "currentAuthMethod": "wallet",
  "users": {
    "did:key:xxx": {
      "credentials": ["credId1", "credId2"],
      "agents": ["did:rooch:agent1"],
      "authMethods": [
        {
          "method": "passkey",
          "identifier": "credId1",
          "addedAt": 1234567890
        }
      ],
      "createdAt": 1234567890,
      "updatedAt": 1234567890
    },
    "did:rooch:0x123": {
      "credentials": [],
      "agents": ["did:rooch:agent2"],
      "authMethods": [
        {
          "method": "wallet",
          "identifier": "0x123...",
          "addedAt": 1234567890
        }
      ],
      "createdAt": 1234567890,
      "updatedAt": 1234567890
    }
  }
}
```

## 组件层级

```
App
├── AuthProvider (Context)
│   ├── RoochProvider
│   │   └── WalletProvider
│   └── VDRProvider
├── Routes
│   ├── LoginPage
│   │   ├── PasskeyLogin
│   │   └── WalletLogin
│   ├── Dashboard
│   │   ├── UserInfo
│   │   ├── AgentList
│   │   └── AuthMethodList
│   └── OnboardingGuard
│       ├── CreatePasskeyStep
│       ├── ConnectWalletStep
│       ├── CreateAgentStep
│       └── ClaimGasStep
└── ProtectedRoute
```
