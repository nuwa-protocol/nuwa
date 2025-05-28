# VDR 接口重构方案

## 背景

在 Rooch DID 系统的实现过程中，我们发现原有的 VDR 接口设计存在一个核心问题：DID 文档在 `store` 时，传入的 `DIDDocument.id` 是预期的 DID，但实际创建的 DID 地址是由 Rooch 区块链动态生成的，两者并不相同。

### 现有问题

1. **DID 地址不确定性**：在调用 `store` 时，调用者需要预先知道 DID 地址，但在 Rooch 系统中，DID 地址是由智能合约动态生成的
2. **接口语义不清晰**：`store` 方法既要负责创建又要负责存储，职责混淆
3. **错误处理困难**：无法清晰地返回实际创建的 DID 信息
4. **调试困难**：难以追踪预期 DID 与实际 DID 的差异

### Rooch DID 系统特点

- DID 地址由区块链合约动态生成（通过 `create_did_object_for_self_entry`）
- 调用者只能提供公钥等基础信息
- 实际的 DID 需要从交易执行结果的事件中解析
- 支持 CADOP（Custodian-Assisted DID Onboarding Protocol）协议

## 重构目标

1. **支持 DID 创建时地址未知的场景**
2. **返回明确的 DID 创建信息**
3. **保持向后兼容性**
4. **适配不同 VDR 实现的需求**
5. **提供清晰的接口语义**

## 重构方案

### 1. 新增类型定义

#### DIDCreationRequest
```typescript
/**
 * DID 创建请求信息
 */
export interface DIDCreationRequest {
  // 基础信息
  publicKeyMultibase: string;
  keyType?: string; // 默认推断，如 'EcdsaSecp256k1VerificationKey2019'
  
  // 可选的预期 DID（某些 VDR 可能支持）
  preferredDID?: string;
  
  // 控制器信息
  controller?: string | string[];
  
  // 初始的验证关系
  initialRelationships?: VerificationRelationship[];
  
  // 初始服务端点
  initialServices?: ServiceEndpoint[];
  
  // 额外的验证方法
  additionalVerificationMethods?: VerificationMethod[];
}
```

#### DIDCreationResult
```typescript
/**
 * DID 创建结果
 */
export interface DIDCreationResult {
  success: boolean;
  did: string; // 实际创建的 DID（必须字段）
  transactionHash?: string;
  blockHeight?: number;
  error?: string;
  
  // 用于调试的额外信息
  debug?: {
    requestedDID?: string;
    actualDID?: string;
    events?: any[];
  };
}
```

#### CADOPCreationRequest
```typescript
/**
 * CADOP 创建请求
 */
export interface CADOPCreationRequest {
  userDidKey: string;
  custodianServicePublicKey: string;
  custodianServiceVMType: string;
  additionalClaims?: Record<string, any>;
}
```

### 2. 扩展 VDRInterface

```typescript
export interface VDRInterface {
  // === 现有方法保持不变 ===
  resolve(did: string): Promise<DIDDocument | null>;
  exists(did: string): Promise<boolean>;
  getMethod(): string;
  
  // === 修改后的存储方法 ===
  /**
   * 使用完整的 DID Document 存储（向后兼容）
   * 主要用于已知 DID 的场景或测试
   * 
   * @param didDocument 完整的 DID 文档
   * @param options 存储选项
   * @returns 是否成功存储
   */
  store(didDocument: DIDDocument, options?: any): Promise<boolean>;
  
  // === 新增创建方法 ===
  /**
   * 创建新的 DID（推荐使用）
   * 适用于 DID 地址由 VDR 动态生成的场景
   * 
   * @param request DID 创建请求
   * @param options 创建选项
   * @returns DID 创建结果，包含实际创建的 DID
   */
  create(request: DIDCreationRequest, options?: any): Promise<DIDCreationResult>;
  
  /**
   * 通过 CADOP 协议创建 DID
   * 
   * @param request CADOP 创建请求
   * @param options 创建选项
   * @returns DID 创建结果
   */
  createViaCADOP(request: CADOPCreationRequest, options?: any): Promise<DIDCreationResult>;
  
  // === 现有的更新方法保持不变 ===
  addVerificationMethod(did: string, verificationMethod: VerificationMethod, relationships?: VerificationRelationship[], options?: any): Promise<boolean>;
  removeVerificationMethod(did: string, id: string, options?: any): Promise<boolean>;
  addService(did: string, service: ServiceEndpoint, options?: any): Promise<boolean>;
  removeService(did: string, id: string, options?: any): Promise<boolean>;
  updateRelationships(did: string, id: string, add: VerificationRelationship[], remove: VerificationRelationship[], options?: any): Promise<boolean>;
  updateController(did: string, controller: string | string[], options?: any): Promise<boolean>;
}
```

### 3. 更新 AbstractVDR

```typescript
export abstract class AbstractVDR implements VDRInterface {
  // 现有属性和方法保持不变
  
  /**
   * 默认的 create 实现 - 构建 DID Document 后调用 store
   * 子类可以重写此方法以提供更高效的实现
   */
  async create(request: DIDCreationRequest, options?: any): Promise<DIDCreationResult> {
    try {
      // 为不支持动态 DID 生成的 VDR 提供默认实现
      if (!request.preferredDID) {
        throw new Error(`${this.method} VDR requires preferredDID in creation request`);
      }
      
      // 构建 DID Document
      const didDocument: DIDDocument = this.buildDIDDocumentFromRequest(request);
      
      // 调用 store
      const success = await this.store(didDocument, options);
      
      if (!success) {
        throw new Error('Failed to store DID document');
      }
      
      return {
        success: true,
        did: request.preferredDID,
        debug: {
          requestedDID: request.preferredDID,
          actualDID: request.preferredDID
        }
      };
    } catch (error) {
      // 对于失败的情况，我们仍然需要返回一个 did 字段
      // 可以返回请求的 preferredDID 或生成一个占位符
      return {
        success: false,
        did: request.preferredDID || `did:${this.method}:failed`,
        error: error instanceof Error ? error.message : 'Unknown error'
      };
    }
  }
  
  /**
   * 默认的 CADOP 实现 - 抛出未实现错误
   */
  async createViaCADOP(request: CADOPCreationRequest, options?: any): Promise<DIDCreationResult> {
    throw new Error(`createViaCADOP not implemented for ${this.method} VDR`);
  }
  
  /**
   * 从创建请求构建 DID Document
   */
  protected buildDIDDocumentFromRequest(request: DIDCreationRequest): DIDDocument {
    const did = request.preferredDID!;
    
    const verificationMethod: VerificationMethod = {
      id: `${did}#account-key`,
      type: request.keyType || 'EcdsaSecp256k1VerificationKey2019',
      controller: request.controller || did,
      publicKeyMultibase: request.publicKeyMultibase
    };
    
    const didDocument: DIDDocument = {
      '@context': ['https://www.w3.org/ns/did/v1'],
      id: did,
      controller: request.controller ? 
        (Array.isArray(request.controller) ? request.controller : [request.controller]) : 
        [did],
      verificationMethod: [verificationMethod, ...(request.additionalVerificationMethods || [])],
      service: request.initialServices || []
    };
    
    // 设置初始关系
    const relationships = request.initialRelationships || 
      ['authentication', 'assertionMethod', 'capabilityInvocation', 'capabilityDelegation'];
    
    const vmId = verificationMethod.id;
    relationships.forEach(rel => {
      if (!didDocument[rel]) {
        didDocument[rel] = [];
      }
      (didDocument[rel] as string[]).push(vmId);
    });
    
    return didDocument;
  }
}
```

### 4. 重构 RoochVDR

```typescript
export class RoochVDR extends AbstractVDR {
  // 现有属性保持不变
  
  /**
   * 重写 create 方法以支持 Rooch 动态 DID 生成
   */
  async create(request: DIDCreationRequest, options?: RoochVDROperationOptions): Promise<DIDCreationResult> {
    try {
      const signer = options?.signer || this.options.signer;
      if (!signer) {
        throw new Error('No signer provided for create operation');
      }
      
      this.debugLog('Creating DID with request:', request);
      
      // 创建交易
      const transaction = this.createTransaction();
      transaction.callFunction({
        target: `${this.didContractAddress}::create_did_object_for_self_entry`,
        args: [Args.string(request.publicKeyMultibase)],
        maxGas: options?.maxGas || 100000000
      });
      
      // 执行交易
      const result = await this.client.signAndExecuteTransaction({
        transaction,
        signer,
        option: { withOutput: true }
      });
      
      const success = result.execution_info.status.type === 'executed';
      
      if (!success) {
        // 失败时返回 preferredDID 或生成一个失败占位符
        return {
          success: false,
          did: request.preferredDID || `did:rooch:failed-${Date.now()}`,
          error: 'Transaction execution failed',
          debug: {
            requestedDID: request.preferredDID,
            transactionResult: result.execution_info
          }
        };
      }
      
      // 解析实际创建的 DID
      let actualDID: string | undefined;
      const didCreatedEvent = result.output?.events?.find((event: any) => 
        event.event_type === '0x3::did::DIDCreatedEvent'
      );
      
      if (didCreatedEvent) {
        try {
          actualDID = this.parseDIDCreatedEventAndGetAddress(didCreatedEvent);
        } catch (error) {
          actualDID = this.parseDIDCreatedEventFallbackAndGetAddress(didCreatedEvent);
        }
      }
      
      if (actualDID) {
        this.lastCreatedDIDAddress = actualDID;
      }
      
      // 确保总是返回一个有效的 DID
      const finalDID = actualDID || request.preferredDID || `did:rooch:unknown-${Date.now()}`;
      
      return {
        success: true,
        did: finalDID,
        transactionHash: result.transaction?.transaction_hash,
        debug: {
          requestedDID: request.preferredDID,
          actualDID: actualDID,
          events: result.output?.events
        }
      };
    } catch (error) {
      this.errorLog('Error creating DID:', error);
      return {
        success: false,
        did: request.preferredDID || `did:rooch:error-${Date.now()}`,
        error: error instanceof Error ? error.message : 'Unknown error'
      };
    }
  }
  
  /**
   * 重写 CADOP 创建方法
   */
  async createViaCADOP(request: CADOPCreationRequest, options?: RoochVDROperationOptions): Promise<DIDCreationResult> {
    try {
      const signer = options?.signer || this.options.signer;
      if (!signer) {
        throw new Error('No custodian signer provided for CADOP operation');
      }
      
      // 创建交易
      const transaction = this.createTransaction();
      transaction.callFunction({
        target: `${this.didContractAddress}::create_did_object_via_cadop_with_did_key_entry`,
        args: [
          Args.string(request.userDidKey),
          Args.string(request.custodianServicePublicKey),
          Args.string(request.custodianServiceVMType)
        ],
        maxGas: options?.maxGas || 100000000
      });
      
      // 执行交易
      const result = await this.client.signAndExecuteTransaction({
        transaction,
        signer,
        option: { withOutput: true }
      });
      
      const success = result.execution_info.status.type === 'executed';
      
      if (!success) {
        return {
          success: false,
          did: `did:rooch:cadop-failed-${Date.now()}`,
          error: 'CADOP transaction execution failed'
        };
      }
      
      // 解析创建的 DID
      let actualDID: string | undefined;
      const didCreatedEvent = result.output?.events?.find((event: any) => 
        event.event_type === '0x3::did::DIDCreatedEvent'
      );
      
      if (didCreatedEvent) {
        try {
          actualDID = this.parseDIDCreatedEventAndGetAddress(didCreatedEvent);
        } catch (error) {
          actualDID = this.parseDIDCreatedEventFallbackAndGetAddress(didCreatedEvent);
        }
      }
      
      return {
        success: true,
        did: actualDID || `did:rooch:cadop-unknown-${Date.now()}`,
        transactionHash: result.transaction?.transaction_hash
      };
    } catch (error) {
      this.errorLog('Error creating DID via CADOP:', error);
      return {
        success: false,
        did: `did:rooch:cadop-error-${Date.now()}`,
        error: error instanceof Error ? error.message : 'Unknown error'
      };
    }
  }
  
  /**
   * 保持现有的 store 方法用于向后兼容
   * 但内部重构为使用 create 方法
   */
  async store(didDocument: DIDDocument, options?: RoochVDROperationOptions): Promise<boolean> {
    try {
      // 从 DID Document 提取创建请求信息
      const firstVM = didDocument.verificationMethod?.[0];
      if (!firstVM || !firstVM.publicKeyMultibase) {
        throw new Error('DID document must have at least one verification method with publicKeyMultibase');
      }
      
      const request: DIDCreationRequest = {
        publicKeyMultibase: firstVM.publicKeyMultibase,
        keyType: firstVM.type,
        preferredDID: didDocument.id,
        controller: didDocument.controller,
        initialRelationships: this.extractRelationshipsFromDocument(didDocument, firstVM.id),
        initialServices: didDocument.service,
        additionalVerificationMethods: didDocument.verificationMethod?.slice(1)
      };
      
      const result = await this.create(request, options);
      
      if (result.success && result.did) {
        this.lastCreatedDIDAddress = result.did;
      }
      
      return result.success;
    } catch (error) {
      this.errorLog('Error in store method:', error);
      return false;
    }
  }
  
  /**
   * 从 DID Document 中提取指定验证方法的关系
   */
  private extractRelationshipsFromDocument(didDocument: DIDDocument, vmId: string): VerificationRelationship[] {
    const relationships: VerificationRelationship[] = [];
    const relationshipTypes: VerificationRelationship[] = [
      'authentication', 'assertionMethod', 'keyAgreement', 
      'capabilityInvocation', 'capabilityDelegation'
    ];
    
    relationshipTypes.forEach(rel => {
      const relationshipArray = didDocument[rel];
      if (relationshipArray && relationshipArray.some(item => 
        typeof item === 'string' ? item === vmId : item.id === vmId
      )) {
        relationships.push(rel);
      }
    });
    
    return relationships;
  }
}
```

## 迁移策略

### 1. 向后兼容性

- **保持现有 `store` 方法**：确保现有代码继续工作
- **内部重构**：`store` 方法内部调用新的 `create` 方法
- **渐进式迁移**：新代码推荐使用 `create` 方法，旧代码可以继续使用 `store`

### 2. 推荐使用方式

#### 新的创建方式（推荐）
```typescript
// 创建 DID
const request: DIDCreationRequest = {
  publicKeyMultibase: publicKeyMultibase,
  keyType: 'EcdsaSecp256k1VerificationKey2019',
  initialRelationships: ['authentication', 'assertionMethod', 'capabilityInvocation', 'capabilityDelegation']
};

const result = await roochVDR.create(request, { signer: keypair });

if (result.success) {
  console.log('Created DID:', result.did);
  actualDIDAddress = result.did;
} else {
  console.error('Failed to create DID:', result.error);
}
```

#### CADOP 创建方式
```typescript
const cadopRequest: CADOPCreationRequest = {
  userDidKey: 'did:key:z6MkhaXgBZDvotDkL5257faiztiGiC2QtKLGpbnnEGta2doK',
  custodianServicePublicKey: 'z6MkhaXgBZDvotDkL5257faiztiGiC2QtKLGpbnnEGta2doK',
  custodianServiceVMType: 'Ed25519VerificationKey2020'
};

const result = await roochVDR.createViaCADOP(cadopRequest, { signer: custodianSigner });
```

#### 传统方式（向后兼容）
```typescript
// 仍然支持，但不推荐新代码使用
const success = await roochVDR.store(didDocument, { signer: keypair });
const actualDID = roochVDR.getLastCreatedDIDAddress(); // 需要额外调用获取实际 DID
```

### 3. 测试更新

```typescript
describe('DID Creation with New Interface', () => {
  it('should create DID using new create method', async () => {
    const request: DIDCreationRequest = {
      publicKeyMultibase: publicKeyMultibase,
      keyType: 'EcdsaSecp256k1VerificationKey2019',
      initialRelationships: ['authentication', 'assertionMethod', 'capabilityInvocation', 'capabilityDelegation']
    };

    const result = await roochVDR.create(request, { signer: keypair });
    
    expect(result.success).toBe(true);
    expect(result.did).toBeTruthy();
    expect(result.did).toMatch(/^did:rooch:rooch1[a-z0-9]+$/);
    
    actualDIDAddress = result.did;
  });

  it('should create DID via CADOP', async () => {
    const request: CADOPCreationRequest = {
      userDidKey: 'did:key:z6MkhaXgBZDvotDkL5257faiztiGiC2QtKLGpbnnEGta2doK',
      custodianServicePublicKey: 'z6MkhaXgBZDvotDkL5257faiztiGiC2QtKLGpbnnEGta2doK',
      custodianServiceVMType: 'Ed25519VerificationKey2020'
    };

    const result = await roochVDR.createViaCADOP(request, { signer: didAccount });
    
    expect(result.success).toBe(true);
    expect(result.did).toBeTruthy();
  });

  it('should maintain backward compatibility with store method', async () => {
    // 确保旧的 store 方法仍然工作
    const success = await roochVDR.store(didDocument, { signer: keypair });
    expect(success).toBe(true);
    
    const actualDID = roochVDR.getLastCreatedDIDAddress();
    expect(actualDID).toBeTruthy();
  });
});
```

## 实现优势

### 1. 清晰的语义分离
- **`create`**：明确表示创建新 DID，适用于动态 DID 生成
- **`store`**：存储已知 DID 文档，主要用于向后兼容

### 2. 更好的错误处理
- 返回详细的创建结果，包含成功状态、实际 DID、交易哈希等
- 提供调试信息，便于问题排查

### 3. 强类型支持
- `DIDCreationResult.did` 为必须字段，确保总是有明确的 DID 返回
- 失败时也返回有意义的 DID（preferredDID 或占位符）

### 4. 扩展性强
- 支持不同 VDR 实现的特殊需求
- 为未来的 DID 创建方式预留扩展空间

### 5. 向后兼容
- 现有代码无需修改即可继续工作
- 提供渐进式迁移路径

### 6. 调试友好
- 提供丰富的调试信息
- 明确区分请求的 DID 和实际创建的 DID

## 总结

这个重构方案解决了 Rooch DID 系统中 DID 地址动态生成的核心问题，同时保持了接口的向后兼容性。通过引入新的 `create` 和 `createViaCADOP` 方法，我们提供了更清晰的语义和更好的开发体验，为未来的 DID 系统扩展奠定了良好的基础。

## 实际测试示例更新

### 1. 更新现有测试（向后兼容）
```typescript
// 现有测试继续工作，无需修改
it('should create a DID document for self (backward compatible)', async () => {
  const didDocument: DIDDocument = {
    '@context': ['https://www.w3.org/ns/did/v1'],
    id: testDid, // 这个 ID 现在只是预期值，实际 DID 会从事件中解析
    controller: [testDid],
    verificationMethod: [{
      id: `${testDid}#account-key`,
      type: 'EcdsaSecp256k1VerificationKey2019',
      controller: testDid,
      publicKeyMultibase: publicKeyMultibase,
    }],
    authentication: [`${testDid}#account-key`],
    assertionMethod: [`${testDid}#account-key`],
    capabilityInvocation: [`${testDid}#account-key`],
    capabilityDelegation: [`${testDid}#account-key`],
  };

  const success = await roochVDR.store(didDocument, { signer: keypair });
  expect(success).toBe(true);

  // 获取实际创建的 DID
  actualDIDAddress = roochVDR.getLastCreatedDIDAddress() || '';
  expect(actualDIDAddress).toBeTruthy();
  expect(actualDIDAddress).toMatch(/^did:rooch:rooch1[a-z0-9]+$/);
});
```

### 2. 新的推荐测试方式
```typescript
// 推荐的新测试方式
it('should create DID using new create method', async () => {
  const request: DIDCreationRequest = {
    publicKeyMultibase: publicKeyMultibase,
    keyType: 'EcdsaSecp256k1VerificationKey2019',
    initialRelationships: [
      'authentication', 
      'assertionMethod', 
      'capabilityInvocation', 
      'capabilityDelegation'
    ]
  };

  const result = await roochVDR.create(request, { signer: keypair });
  
  expect(result.success).toBe(true);
  expect(result.did).toBeTruthy();
  expect(result.did).toMatch(/^did:rooch:rooch1[a-z0-9]+$/);
  expect(result.transactionHash).toBeTruthy();
  expect(result.debug?.actualDID).toBe(result.did);
  
  actualDIDAddress = result.did;
  
  console.log('✅ Created DID:', result.did);
  console.log('📝 Transaction Hash:', result.transactionHash);
});

it('should create DID via CADOP', async () => {
  const cadopRequest: CADOPCreationRequest = {
    userDidKey: 'did:key:z6MkhaXgBZDvotDkL5257faiztiGiC2QtKLGpbnnEGta2doK',
    custodianServicePublicKey: 'z6MkhaXgBZDvotDkL5257faiztiGiC2QtKLGpbnnEGta2doK',
    custodianServiceVMType: 'Ed25519VerificationKey2020'
  };

  const result = await roochVDR.createViaCADOP(cadopRequest, { signer: custodianSigner });
  
  expect(result.success).toBe(true);
  expect(result.did).toBeTruthy();
  expect(result.did).toMatch(/^did:rooch:rooch1[a-z0-9]+$/);
  
  console.log('✅ Created DID via CADOP:', result.did);
});
```

### 3. 不同 VDR 的使用示例

#### KeyVDR 使用示例
```typescript
it('should create did:key using new interface', async () => {
  const request: DIDCreationRequest = {
    publicKeyMultibase: 'z6MkhaXgBZDvotDkL5257faiztiGiC2QtKLGpbnnEGta2doK',
    keyType: 'Ed25519VerificationKey2020'
    // preferredDID 可选，如果不提供会从公钥生成
  };

  const result = await keyVDR.create(request);
  
  expect(result.success).toBe(true);
  expect(result.did).toBe('did:key:z6MkhaXgBZDvotDkL5257faiztiGiC2QtKLGpbnnEGta2doK');
});
```

#### WebVDR 使用示例
```typescript
it('should create did:web using new interface', async () => {
  const request: DIDCreationRequest = {
    publicKeyMultibase: 'z6MkhaXgBZDvotDkL5257faiztiGiC2QtKLGpbnnEGta2doK',
    keyType: 'Ed25519VerificationKey2020',
    preferredDID: 'did:web:example.com', // 必须提供，因为需要指定域名
    initialServices: [{
      id: 'did:web:example.com#service-1',
      type: 'LinkedDomains',
      serviceEndpoint: 'https://example.com'
    }]
  };

  const result = await webVDR.create(request, { 
    uploadHandler: mockUploadHandler 
  });
  
  expect(result.success).toBe(true);
  expect(result.did).toBe('did:web:example.com');
});
```

### 4. 错误处理测试
```typescript
it('should handle creation failures gracefully', async () => {
  const request: DIDCreationRequest = {
    publicKeyMultibase: 'invalid-key',
    keyType: 'InvalidKeyType'
  };

  const result = await roochVDR.create(request, { signer: keypair });
  
  expect(result.success).toBe(false);
  expect(result.did).toBeTruthy(); // 仍然返回有效的 DID（失败占位符）
  expect(result.error).toBeTruthy();
  expect(result.did).toMatch(/^did:rooch:(failed|error)-\d+$/);
});
```

### 5. 向后兼容性验证测试
```typescript
it('should maintain backward compatibility', async () => {
  // 测试现有的 store 方法仍然工作
  const didDocument: DIDDocument = createTestDIDDocument();
  const success = await roochVDR.store(didDocument, { signer: keypair });
  expect(success).toBe(true);
  
  const actualDID = roochVDR.getLastCreatedDIDAddress();
  expect(actualDID).toBeTruthy();
  
  // 测试新的 create 方法产生相同的结果
  const request: DIDCreationRequest = {
    publicKeyMultibase: didDocument.verificationMethod![0].publicKeyMultibase!,
    keyType: didDocument.verificationMethod![0].type,
    preferredDID: didDocument.id,
    initialRelationships: ['authentication', 'assertionMethod']
  };
  
  const result = await roochVDR.create(request, { signer: keypair });
  expect(result.success).toBe(true);
  expect(result.did).toMatch(/^did:rooch:rooch1[a-z0-9]+$/);
});
```

通过这些测试示例，开发者可以看到：
1. 现有代码可以继续工作（向后兼容）
2. 新接口提供了更清晰的语义和更好的错误处理
3. 不同 VDR 实现有各自的特点和要求
4. 错误情况下也能得到有意义的结果

## 总结

这个重构方案解决了 Rooch DID 系统中 DID 地址动态生成的核心问题，同时保持了接口的向后兼容性。通过引入新的 `create` 和 `createViaCADOP` 方法，我们提供了更清晰的语义和更好的开发体验，为未来的 DID 系统扩展奠定了良好的基础。 