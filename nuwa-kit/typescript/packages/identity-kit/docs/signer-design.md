# NuwaIdentityKit Signer 设计方案

## 1. 背景与需求分析

### 1.1 NIP 规范要求

根据 NIP-1/2/3 规范的要求：

1. **NIP-1 多密钥模型**：
   - 单一主 DID + 多个操作密钥的模型
   - 不同的验证关系（authentication, assertionMethod, capabilityInvocation, capabilityDelegation）
   - 密钥的生命周期管理（生成、注册、撤销）

2. **NIP-2 签名规范**：
   - 标准的签名数据结构
   - 防重放机制（nonce 和 timestamp）
   - 域分隔符（domain separator）

3. **NIP-3 托管服务**：
   - Passkey 作为初始密钥
   - 托管服务的密钥管理
   - Sybil 防护机制

### 1.2 实际应用场景

1. **多设备场景**：
   - 手机上的 Passkey
   - 桌面浏览器的 Passkey
   - 硬件钱包的密钥

2. **不同用途的密钥**：
   - 身份认证用的密钥（authentication）
   - 服务调用用的密钥（capabilityInvocation）
   - 管理其他密钥的主密钥（capabilityDelegation）

3. **链上操作**：
   - VDR（如 Rooch）交易签名
   - 链上权限验证

## 2. 核心接口设计

### 2.1 SignerInterface

```typescript
export interface SignerInterface {
  /**
   * 获取当前 Signer 可用的所有密钥 ID
   * @returns 可用的密钥 ID 列表
   */
  listKeyIds(): Promise<string[]>;

  /**
   * 使用指定密钥进行签名
   * @param data 要签名的数据
   * @param keyId 用于签名的密钥 ID
   * @returns 签名结果
   */
  signWithKeyId(data: Uint8Array, keyId: string): Promise<Uint8Array>;

  /**
   * 检查是否可以使用指定密钥进行签名
   * @param keyId 要检查的密钥 ID
   * @returns 是否可以使用该密钥签名
   */
  canSignWithKeyId(keyId: string): Promise<boolean>;
}
```

### 2.2 NIP-1 签名数据结构

```typescript
export interface SignedData {
  operation: string;
  params: Record<string, any>;
  nonce: string;
  timestamp: number;
}

export interface NIP1Signature {
  signer_did: string;
  key_id: string;
  value: Uint8Array;
}

export interface NIP1SignedObject {
  signed_data: SignedData;
  signature: NIP1Signature;
}
```

## 3. NuwaIdentityKit 集成

### 3.1 基础结构

```typescript
export class NuwaIdentityKit {
  private didDocument: DIDDocument;
  private vdr: VDRInterface;
  private signer: SignerInterface;

  constructor(
    didDocument: DIDDocument,
    vdr: VDRInterface,
    signer: SignerInterface
  ) {
    this.didDocument = didDocument;
    this.vdr = vdr;
    this.signer = signer;
  }
}
```

### 3.2 DID 文档修改操作

```typescript
async addVerificationMethod(
  keyInfo: OperationalKeyInfo,
  relationships: VerificationRelationship[],
  options?: {
    keyId?: string;
  }
): Promise<string> {
  // 1. 获取签名密钥
  const signingKeyId = options?.keyId || await this.findKeyWithRelationship('capabilityDelegation');
  if (!signingKeyId) {
    throw new Error('No key with capabilityDelegation permission available');
  }

  // 2. 构造 verificationMethod
  const keyIdFragment = keyInfo.idFragment || `key-${Date.now()}`;
  const keyId = `${this.didDocument.id}#${keyIdFragment}`;
  const verificationMethodEntry = {
    id: keyId,
    type: keyInfo.type,
    controller: keyInfo.controller || this.didDocument.id,
    publicKeyMultibase: keyInfo.publicKeyMaterial instanceof Uint8Array 
      ? await KeyMultibaseCodec.encodeWithType(keyInfo.publicKeyMaterial, keyInfo.type)
      : undefined,
    publicKeyJwk: !(keyInfo.publicKeyMaterial instanceof Uint8Array)
      ? keyInfo.publicKeyMaterial
      : undefined
  };

  // 3. 调用 VDR 接口
  const published = await this.vdr.addVerificationMethod(
    this.didDocument.id,
    verificationMethodEntry,
    relationships,
    {
      signer: this.signer,
      keyId: signingKeyId
    }
  );

  if (!published) {
    throw new Error(`Failed to publish verification method ${keyId}`);
  }

  // 4. 更新本地状态
  await this.updateLocalDIDDocument();
  
  return keyId;
}
```

## 4. 实现示例

### 4.1 本地密钥管理实现

```typescript
export class LocalSigner implements SignerInterface {
  private keys: Map<string, CryptoKey | Uint8Array>;

  async listKeyIds(): Promise<string[]> {
    return Array.from(this.keys.keys());
  }

  async signWithKeyId(data: Uint8Array, keyId: string): Promise<Uint8Array> {
    const key = this.keys.get(keyId);
    if (!key) throw new Error(`Key ${keyId} not found`);
    return CryptoUtils.sign(data, key);
  }

  async canSignWithKeyId(keyId: string): Promise<boolean> {
    return this.keys.has(keyId);
  }
}
```

### 4.2 Passkey 实现

```typescript
export class PasskeySigner implements SignerInterface {
  private passkey: PublicKeyCredential;
  private keyId: string; // Passkey 通常只有一个密钥

  constructor(passkey: PublicKeyCredential) {
    this.passkey = passkey;
    this.keyId = passkey.id;
  }

  async listKeyIds(): Promise<string[]> {
    return [this.keyId];
  }

  async signWithKeyId(data: Uint8Array, keyId: string): Promise<Uint8Array> {
    if (keyId !== this.keyId) {
      throw new Error(`Invalid keyId: ${keyId}`);
    }
    const assertion = await navigator.credentials.get({
      publicKey: {
        challenge: data,
        allowCredentials: [{ id: keyId, type: 'public-key' }]
      }
    });
    return assertion.response.signature;
  }

  async canSignWithKeyId(keyId: string): Promise<boolean> {
    return keyId === this.keyId;
  }
}
```

### 4.3 Rooch VDR 集成

```typescript
export class RoochVDR implements VDRInterface {
  async addVerificationMethod(
    did: string,
    verificationMethod: VerificationMethod,
    relationships: VerificationRelationship[],
    options: {
      signer: SignerInterface;
      keyId: string;
    }
  ): Promise<boolean> {
    // 1. 构造交易
    const transaction = this.createTransaction();
    transaction.callFunction({
      target: `${this.didContractAddress}::add_verification_method_entry`,
      args: [/* ... */]
    });

    // 2. 使用提供的 signer 签名交易
    // Rooch VDR 会验证签名者是否有 capabilityDelegation 权限
    const signature = await options.signer.signWithKeyId(
      transaction.hashData(),
      options.keyId
    );

    // 3. 执行交易
    const result = await this.client.executeTransaction({
      transaction,
      signature
    });

    return result.status === 'success';
  }
}
```

## 5. 使用示例

### 5.1 基本使用

```typescript
// 创建 Signer 实例
const localSigner = new LocalSigner();

// 初始化 NuwaIdentityKit
const identityKit = await NuwaIdentityKit.fromExistingDID(did, localSigner);

// 添加验证方法 - 自动选择密钥
await identityKit.addVerificationMethod(keyInfo, relationships);

// 添加验证方法 - 指定密钥
await identityKit.addVerificationMethod(keyInfo, relationships, {
  keyId: 'did:example:123#key-1'
});
```

### 5.2 Passkey 场景

```typescript
// 创建 Passkey
const passkey = await navigator.credentials.create({
  publicKey: {
    // WebAuthn options
  }
});

// 创建 PasskeySigner
const passkeySigner = new PasskeySigner(passkey);

// 使用 Passkey 初始化 NuwaIdentityKit
const identityKit = await NuwaIdentityKit.fromExistingDID(did, passkeySigner);
```

## 6. 设计优势

1. **简洁性**：
   - 简单的接口设计
   - 清晰的职责分离
   - 易于理解和使用

2. **灵活性**：
   - 支持多种密钥管理策略
   - 可以轻松扩展新的 Signer 实现
   - 支持自动和手动密钥选择

3. **安全性**：
   - 密钥操作封装在 Signer 中
   - 链上 VDR 验证权限
   - 支持密钥隔离

4. **符合规范**：
   - 完全符合 NIP-1/2/3 规范
   - 支持标准的签名结构
   - 支持多密钥模型

## 7. 注意事项

1. **权限验证**：
   - 链上 VDR 负责最终的权限验证
   - 本地的 findKeyWithRelationship 仅用于辅助选择合适的密钥

2. **密钥管理**：
   - Signer 实现需要确保密钥的安全存储
   - 建议实现密钥的定期轮换机制
   - 注意处理密钥的生命周期管理

3. **错误处理**：
   - 需要妥善处理找不到合适密钥的情况
   - 需要处理签名失败的情况
   - 需要处理 VDR 操作失败的情况

## 8. 未来扩展

1. **密钥管理增强**：
   - 支持更多类型的密钥存储（HSM、智能卡等）
   - 添加密钥备份和恢复机制
   - 实现密钥轮换策略

2. **权限管理增强**：
   - 支持更细粒度的权限控制
   - 添加权限委托机制
   - 支持临时权限授予

3. **安全性增强**：
   - 添加密钥使用审计
   - 实现异常检测机制
   - 支持多重签名

4. **集成增强**：
   - 支持更多的 VDR 实现
   - 添加更多的 Signer 实现
   - 支持跨链操作 