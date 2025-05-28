# NuwaIdentityKit 重构方案

## 背景

基于对当前 `NuwaIdentityKit` 类的分析，发现了以下主要问题：

1. **接口职责混乱**：核心 DID 管理与 CADOP 特定功能耦合
2. **逻辑矛盾**：`publishDIDDocument` 方法与构造函数的设计逻辑冲突
3. **安全性问题**：私钥管理方法暴露过多
4. **API 设计不一致**：方法命名和参数类型不统一
5. **功能重复**：本地操作和发布操作方法重复

## 重构目标

1. **职责分离**：将核心 DID 管理与特定协议功能分离
2. **简化 API**：提供清晰、一致的接口
3. **提高安全性**：减少私钥暴露，改进密钥管理
4. **改善用户体验**：提供更直观的工作流程

## 重构方案

### 1. 核心类重构

#### 1.1 重新设计 NuwaIdentityKit

```typescript
export class NuwaIdentityKit {
  private didDocument: DIDDocument;
  private operationalPrivateKeys: Map<string, CryptoKey | Uint8Array> = new Map();
  private externalSigner?: SignerInterface;
  private vdrRegistry: Map<string, VDRInterface> = new Map();

  // 私有构造函数，强制使用工厂方法
  private constructor(
    didDocument: DIDDocument,
    options?: {
      operationalPrivateKeys?: Map<string, CryptoKey | Uint8Array>,
      externalSigner?: SignerInterface,
      vdrs?: VDRInterface[]
    }
  ) {
    // 实现
  }
}
```

#### 1.2 新的工厂方法

```typescript
export class NuwaIdentityKit {
  /**
   * 从现有 DID 创建实例（管理已存在的 DID）
   */
  static async fromExistingDID(
    did: string,
    vdrs: VDRInterface[],
    options?: {
      operationalPrivateKeys?: Map<string, CryptoKey | Uint8Array>,
      externalSigner?: SignerInterface
    }
  ): Promise<NuwaIdentityKit> {
    // 解析 DID 获取 DID 文档
    // 创建实例
  }

  /**
   * 从 DID 文档创建实例（用于已知 DID 文档的场景）
   */
  static fromDIDDocument(
    didDocument: DIDDocument,
    options?: {
      operationalPrivateKeys?: Map<string, CryptoKey | Uint8Array>,
      externalSigner?: SignerInterface,
      vdrs?: VDRInterface[]
    }
  ): NuwaIdentityKit {
    // 直接创建实例
  }

  /**
   * 创建新的 DID 并发布（替代 publishDIDDocument）
   */
  static async createNewDID(
    creationRequest: DIDCreationRequest,
    vdr: VDRInterface,
    signer: SignerInterface
  ): Promise<NuwaIdentityKit> {
    // 使用 VDR 创建 DID
    // 返回管理该 DID 的实例
  }

  /**
   * 从主身份创建实例（便捷方法）
   */
  static fromMasterIdentity(
    masterIdentity: MasterIdentity,
    vdrs?: VDRInterface[]
  ): NuwaIdentityKit {
    // 现有逻辑，但使用新的构造方式
  }

  /**
   * 委托模式实例（NIP-3）
   */
  static createDelegated(
    didDocument: DIDDocument,
    operationalPrivateKeys?: Map<string, CryptoKey | Uint8Array>
  ): NuwaIdentityKit {
    // 委托模式实例
  }
}
```

### 2. 简化核心 API

#### 2.1 移除冗余方法

**删除的方法：**
- `publishDIDDocument()` - 逻辑有问题
- `createAndPublishIfNotExists()` - 由工厂方法替代
- `addOperationalKey()` - 仅保留发布版本
- `addService()` - 仅保留发布版本
- `removeOperationalKey()` - 仅保留发布版本
- `removeService()` - 仅保留发布版本

#### 2.2 重命名方法

```typescript
// 原方法名 -> 新方法名
addOperationalKeyAndPublish -> addVerificationMethod
removeOperationalKeyAndPublish -> removeVerificationMethod
addServiceAndPublish -> addService
removeServiceAndPublish -> removeService
updateRelationships -> updateVerificationMethodRelationships
```

#### 2.3 改进方法签名

```typescript
// 定义具体的选项类型而不是 any
interface PublishOptions {
  keyId: string;
  signer?: SignerInterface;
  // 其他具体选项
}

async addVerificationMethod(
  keyInfo: OperationalKeyInfo,
  relationships: VerificationRelationship[],
  options: PublishOptions
): Promise<string>
```

### 3. 安全性改进

#### 3.1 私钥管理

```typescript
export class NuwaIdentityKit {
  // 私有化私钥访问方法
  private storeOperationalPrivateKey(keyId: string, privateKey: CryptoKey | Uint8Array): void
  private getOperationalPrivateKey(keyId: string): CryptoKey | Uint8Array | undefined

  // 提供安全的密钥检查方法
  async canSignWithKey(keyId: string): Promise<boolean>
  
  // 移除直接暴露私钥的方法
  // getOperationalPrivateKey() - 删除此公开方法
}
```

### 4. 功能分离

#### 4.1 CADOP 功能分离

创建独立的 CADOP 工具类：

```typescript
export class CadopIdentityKit {
  constructor(private baseKit: NuwaIdentityKit) {}

  // CADOP 特定的服务发现方法
  findCustodianServices(): ServiceEndpoint[]
  findIdPServices(): ServiceEndpoint[]
  findWeb2ProofServices(): ServiceEndpoint[]
  
  async discoverCustodianServices(custodianDid: string): Promise<ServiceEndpoint[]>
  async discoverIdPServices(idpDid: string): Promise<ServiceEndpoint[]>
  async discoverWeb2ProofServices(providerDid: string): Promise<ServiceEndpoint[]>
  
  // CADOP 特定的验证方法
  static validateCustodianService(service: ServiceEndpoint): boolean
  static validateIdPService(service: ServiceEndpoint): boolean
  static validateWeb2ProofService(service: ServiceEndpoint): boolean
}
```

#### 4.2 从主类中移除 CADOP 方法

从 `NuwaIdentityKit` 中移除所有 `findCadop*` 和 `discoverCadop*` 方法。

### 5. 保留的核心功能

```typescript
export class NuwaIdentityKit {
  // VDR 管理
  registerVDR(vdr: VDRInterface): NuwaIdentityKit
  getVDR(method: string): VDRInterface | undefined
  
  // 验证方法管理
  async addVerificationMethod(keyInfo: OperationalKeyInfo, relationships: VerificationRelationship[], options: PublishOptions): Promise<string>
  async removeVerificationMethod(keyId: string, options: PublishOptions): Promise<boolean>
  async updateVerificationMethodRelationships(keyId: string, addRelationships: VerificationRelationship[], removeRelationships: VerificationRelationship[], options: PublishOptions): Promise<boolean>
  
  // 服务管理
  async addService(serviceInfo: ServiceInfo, options: PublishOptions): Promise<string>
  async removeService(serviceId: string, options: PublishOptions): Promise<boolean>
  
  // 签名和验证
  async createNIP1Signature(payload: Omit<SignedData, 'nonce' | 'timestamp'>, keyId: string): Promise<NIP1SignedObject>
  static async verifyNIP1Signature(signedObject: NIP1SignedObject, resolvedDidDocumentOrVDRs: DIDDocument | VDRInterface[]): Promise<boolean>
  
  // DID 解析
  async resolveDID(did: string): Promise<DIDDocument | null>
  async didExists(did: string): Promise<boolean>
  
  // 文档访问
  getDIDDocument(): DIDDocument
  
  // 通用服务查找
  findServiceByType(serviceType: string): any | undefined
  
  // 状态检查
  getExternalSigner(): SignerInterface | undefined
  async canSignWithKey(keyId: string): Promise<boolean>
  isDelegatedMode(): boolean
}
```

### 6. 迁移指南

#### 6.1 创建新 DID 的新方式

**旧方式：**
```typescript
const masterIdentity = await NuwaIdentityKit.createMasterIdentity(options);
const kit = new NuwaIdentityKit(masterIdentity.didDocument, { externalSigner: signer });
await kit.publishDIDDocument();
```

**新方式：**
```typescript
const kit = await NuwaIdentityKit.createNewDID(creationRequest, vdr, signer);
```

#### 6.2 管理现有 DID 的新方式

**旧方式：**
```typescript
const kit = new NuwaIdentityKit(didDocument, options);
```

**新方式：**
```typescript
const kit = await NuwaIdentityKit.fromExistingDID(did, vdrs, options);
// 或
const kit = NuwaIdentityKit.fromDIDDocument(didDocument, options);
```

#### 6.3 CADOP 功能的新方式

**旧方式：**
```typescript
const services = kit.findCadopCustodianServices();
```

**新方式：**
```typescript
const cadopKit = new CadopIdentityKit(kit);
const services = cadopKit.findCustodianServices();
```

### 7. 实施步骤

1. **第一阶段**：创建新的工厂方法和核心 API
2. **第二阶段**：分离 CADOP 功能到独立类
3. **第三阶段**：移除冗余和问题方法
4. **第四阶段**：改进安全性和私钥管理
5. **第五阶段**：完善文档和测试

### 8. 破坏性变更

- 移除 `publishDIDDocument()` 方法
- 私有化私钥访问方法
- 重命名多个方法
- CADOP 功能移到独立类
- 构造函数改为私有，强制使用工厂方法

这个重构将显著改善 API 的一致性、安全性和可维护性，同时为不同使用场景提供更清晰的工作流程。
