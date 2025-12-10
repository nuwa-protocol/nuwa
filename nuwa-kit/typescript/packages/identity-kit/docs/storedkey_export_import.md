# StoredKey 导出 / 导入方案

> 本文档描述了在 `identity-kit` 中如何将 `StoredKey` 序列化为单字符串，并再次导入构建 `KeyManager`，以便通过环境变量等方式便捷传递私钥信息。

---

## 1. 目标与约束

1. **单字符串**：能够把 `StoredKey` 序列化成一个字符串（便于存放在 `.env`、CI Secret 等）。
2. **可逆导入**：可以从该字符串恢复出 `StoredKey` 并导入 `KeyManager`。
3. **通用可扩展**：支持多种编码格式，未来可一次导入多把钥匙。
4. **保持抽象**：不破坏既有 `KeyStore`/`KeyManager` 的抽象，充分复用现有能力。

---

## 2. 核心思路

1. 新增 `StoredKeyCodec`：负责
   - `StoredKey` ↔ JSON
   - JSON ↔ **Multibase**（固定使用 `base58btc` 编码，即 `z` 前缀）
   - 调用方**暂不自定义** codec，后续再行扩展
2. 在 `KeyManager` 中增加三个 API：
   - `exportKeyToString(keyId, format?)` → 导出 `StoredKey` 字符串
   - `importKeyFromString(serialized, format?)` → 将字符串解析并注入当前 `KeyManager`
   - `KeyManager.fromSerializedKey(serialized, format?, store?)` → 工厂方法，直接用字符串创建 `KeyManager`
3. 字符串格式采用前缀标记，方便解析：

   ```text
   base64:eyJrZXlJZCI6ICJkaWQ6ZXhhbXBsZS...   # Base64 编码 JSON
   json:{"keyId":"did:example..."}          # 直接 JSON（调试友好）
   ```

   无前缀时默认按 `base64` 处理。

4. **导出流程**：
   1. 读取指定 `StoredKey`。
   2. `StoredKeyCodec.encode()` 转成字符串。
   3. 返回给调用方，用于打印或写入环境变量。
5. **导入流程**：
   1. 读取 `process.env.STORED_KEY`（或其它来源）。
   2. 使用 `KeyManager.fromSerializedKey()` 解析并构建。
6. **安全提示**：私钥以明文（Base64）存在，仅适用于开发 / 内网 CI。生产应使用 HSM / KMS 或实现不暴露私钥的 `KeyStore.sign()`。

---

## 3. 接口设计（TypeScript 片段）

```ts
// StoredKeyCodec.ts
import { MultibaseCodec } from '../multibase';

export class StoredKeyCodec {
  /**
   * 将 StoredKey 序列化为 base58btc multibase 字符串（前缀 `z`）
   */
  static encode(key: StoredKey): string {
    const json = JSON.stringify(key);
    return MultibaseCodec.encodeBase58btc(json);
  }

  /**
   * 从 base58btc multibase 字符串反序列化 StoredKey
   */
  static decode(serialized: string): StoredKey {
    const json = MultibaseCodec.decodeBase58btc(serialized);
    // MultibaseCodec 返回 Uint8Array，需要转字符串
    const jsonStr = new TextDecoder().decode(json);
    return JSON.parse(jsonStr) as StoredKey;
  }
}
```

```ts
// KeyManager.ts (新增方法)
export class KeyManager {
  // ... existing code ...

  /** 将指定 keyId 导出为字符串 */
  async exportKeyToString(keyId: string): Promise<string> {
    const key = await this.getStoredKey(keyId);
    if (!key) throw new Error(`Key ${keyId} not found`);
    return StoredKeyCodec.encode(key);
  }

  /** 通过字符串导入 StoredKey 到当前 KeyManager */
  async importKeyFromString(serialized: string): Promise<StoredKey> {
    const key = StoredKeyCodec.decode(serialized);
    await this.importKey(key);
    return key;
  }

  /** 根据序列化字符串快速创建并返回 KeyManager */
  static async fromSerializedKey(
    serialized: string,
    store: KeyStore = new MemoryKeyStore()
  ): Promise<KeyManager> {
    const key = StoredKeyCodec.decode(serialized);
    const km = KeyManager.createEmpty(getDidWithoutFragment(key.keyId), store);
    await km.importKey(key);
    return km;
  }
}
```

---

## 4. 使用示例

### 4.1 导出并写入环境变量

```ts
const { keyManager, keyId } = await KeyManager.createWithDidKey();
const envString = await keyManager.exportKeyToString(keyId); // 默认 base64
console.log('STORED_KEY=', envString);
```

### 4.2 .env 示例

```env
STORED_KEY=zeyJrZXlJZCI6ICJkaWQ6a2V5Ono2VE...
```

### 4.3 应用启动时导入

```ts
import { KeyManager } from '@nuwa/identity-kit';

export async function loadKeyManager(): Promise<KeyManager> {
  const serialized = process.env.STORED_KEY;
  if (!serialized) throw new Error('STORED_KEY env not set');
  return KeyManager.fromSerializedKey(serialized);
}
```

---

## 5. 扩展与兼容性

1. **多把钥匙**：可让 `StoredKeyCodec` 支持 `StoredKey[]`，字符串使用 `;` 分隔或整体 JSON 数组。
2. **更安全的实现**：未来接入云端 KMS，可让 `exportKeyToString` 在检测到不允许导出私钥的 `KeyStore` 时抛错或返回受限内容。
3. **向下兼容**：新增方法均为可选使用，不影响现有 API。

---

## 6. 小结

该方案在保持 `KeyStore`/`KeyManager` 原有设计的前提下，引入 `StoredKeyCodec` 与若干便捷方法，实现了 _StoredKey ↔ 字符串_ 的双向转换，满足了通过环境变量快速注入私钥的场景需求，同时为多钥匙与安全增强预留扩展空间。

---

## 7. 公钥一致性校验需求与改进方案

### 7.1 问题分析

当前导入 `StoredKey` 时，其中可能同时包含 `privateKeyMultibase` 和 `publicKeyMultibase`。为确保数据完整性，需要校验这两个密钥的一致性（即 private key 能否推导出对应的 public key）。

**当前 crypto 库的局限性**：

1. `CryptoProvider` 接口缺少 `derivePublicKey` 方法
2. 只有 `Secp256k1Provider` 内部使用了 `secp256k1.getPublicKey()` 进行公钥推导
3. `Ed25519Provider` 和 `EcdsaR1Provider` 没有提供从私钥推导公钥的功能

### 7.2 改进方案

#### 7.2.1 扩展 CryptoProvider 接口

```ts
// crypto/providers.ts
export interface CryptoProvider {
  // ... existing methods ...

  /**
   * Derive public key from private key
   * @param privateKey The private key bytes
   * @returns The corresponding public key bytes
   */
  derivePublicKey(privateKey: Uint8Array): Promise<Uint8Array>;
}
```

#### 7.2.2 为各 Provider 实现 derivePublicKey

```ts
// crypto/providers/secp256k1.ts
export class Secp256k1Provider implements CryptoProvider {
  // ... existing methods ...

  async derivePublicKey(privateKey: Uint8Array): Promise<Uint8Array> {
    return secp256k1.getPublicKey(privateKey, true); // compressed format
  }
}

// crypto/providers/ed25519.ts
export class Ed25519Provider implements CryptoProvider {
  // ... existing methods ...

  async derivePublicKey(privateKey: Uint8Array): Promise<Uint8Array> {
    // Import private key and derive public key using Web Crypto API
    const cryptoKey = await this.crypto.subtle.importKey(
      'pkcs8',
      privateKey,
      { name: 'Ed25519', namedCurve: 'Ed25519' },
      true,
      ['sign']
    );

    // Export as JWK to get public key coordinates
    const jwk = await this.crypto.subtle.exportKey('jwk', cryptoKey);
    if (!jwk.x) throw new Error('Failed to derive public key from private key');

    // Convert base64url to raw bytes
    return MultibaseCodec.decodeBase64url(`u${jwk.x}`);
  }
}

// crypto/providers/ecdsa_r1.ts
export class EcdsaR1Provider implements CryptoProvider {
  // ... existing methods ...

  async derivePublicKey(privateKey: Uint8Array): Promise<Uint8Array> {
    // Import private key
    const cryptoKey = await this.crypto.subtle.importKey(
      'pkcs8',
      privateKey,
      { name: 'ECDSA', namedCurve: 'P-256' },
      true,
      ['sign']
    );

    // Export as JWK and reconstruct public key
    const jwk = await this.crypto.subtle.exportKey('jwk', cryptoKey);
    if (!jwk.x || !jwk.y) throw new Error('Failed to derive public key from private key');

    // Reconstruct uncompressed public key and compress it
    const x = MultibaseCodec.decodeBase64url(`u${jwk.x}`);
    const y = MultibaseCodec.decodeBase64url(`u${jwk.y}`);

    const uncompressed = new Uint8Array(65);
    uncompressed[0] = 0x04;
    uncompressed.set(x, 1);
    uncompressed.set(y, 33);

    return this.compressPublicKey(uncompressed);
  }
}
```

#### 7.2.3 扩展 CryptoUtils

```ts
// crypto/utils.ts
export class CryptoUtils {
  // ... existing methods ...

  /**
   * Derive public key from private key
   * @param privateKey The private key bytes
   * @param keyType The key type
   * @returns The corresponding public key bytes
   */
  static async derivePublicKey(privateKey: Uint8Array, keyType: KeyTypeInput): Promise<Uint8Array> {
    const type = typeof keyType === 'string' ? toKeyType(keyType) : keyType;
    const provider = defaultCryptoProviderFactory.createProvider(type);
    return provider.derivePublicKey(privateKey);
  }
}
```

#### 7.2.4 增强 StoredKeyCodec 校验功能

```ts
// StoredKeyCodec.ts
export class StoredKeyCodec {
  // ... existing methods ...

  /**
   * 校验 StoredKey 中私钥和公钥的一致性
   */
  static async validateKeyConsistency(key: StoredKey): Promise<boolean> {
    if (!key.privateKeyMultibase || !key.publicKeyMultibase) {
      // 如果缺少任一密钥，跳过校验
      return true;
    }

    try {
      // 解码私钥和公钥
      const privateKeyBytes = MultibaseCodec.decodeBase58btc(key.privateKeyMultibase);
      const publicKeyBytes = MultibaseCodec.decodeBase58btc(key.publicKeyMultibase);

      // 从私钥推导公钥
      const derivedPublicKey = await CryptoUtils.derivePublicKey(privateKeyBytes, key.keyType);

      // 比较公钥是否一致
      return this.areUint8ArraysEqual(derivedPublicKey, publicKeyBytes);
    } catch (error) {
      console.warn('Key consistency validation failed:', error);
      return false;
    }
  }

  private static areUint8ArraysEqual(a: Uint8Array, b: Uint8Array): boolean {
    if (a.length !== b.length) return false;
    for (let i = 0; i < a.length; i++) {
      if (a[i] !== b[i]) return false;
    }
    return true;
  }

  /**
   * 解码并校验 StoredKey
   */
  static async decodeAndValidate(serialized: string): Promise<StoredKey> {
    const key = this.decode(serialized);
    const isValid = await this.validateKeyConsistency(key);

    if (!isValid) {
      throw new Error('StoredKey validation failed: private and public keys are inconsistent');
    }

    return key;
  }
}
```

#### 7.2.5 更新 KeyManager 导入方法

```ts
// KeyManager.ts (新增方法)
export class KeyManager {
  // ... existing methods ...

  /** 通过字符串导入 StoredKey（带校验） */
  async importKeyFromStringWithValidation(serialized: string): Promise<StoredKey> {
    const key = await StoredKeyCodec.decodeAndValidate(serialized);
    await this.importKey(key);
    return key;
  }

  /** 根据序列化字符串快速创建 KeyManager（带校验） */
  static async fromSerializedKeyWithValidation(
    serialized: string,
    store: KeyStore = new MemoryKeyStore()
  ): Promise<KeyManager> {
    const key = await StoredKeyCodec.decodeAndValidate(serialized);
    const km = KeyManager.createEmpty(getDidWithoutFragment(key.keyId), store);
    await km.importKey(key);
    return km;
  }
}
```

### 7.3 使用示例

```ts
// 导入时自动校验
try {
  const km = await KeyManager.fromSerializedKeyWithValidation(process.env.STORED_KEY!);
  console.log('Key imported and validated successfully');
} catch (error) {
  console.error('Key validation failed:', error.message);
}

// 手动校验现有 StoredKey
const isValid = await StoredKeyCodec.validateKeyConsistency(storedKey);
if (!isValid) {
  throw new Error('Inconsistent key pair detected');
}
```

### 7.4 实施优先级

1. **高优先级**：扩展 `CryptoProvider` 接口和 `Secp256k1Provider` 实现（已部分具备）
2. **中优先级**：实现 `Ed25519Provider.derivePublicKey()`
3. **低优先级**：实现 `EcdsaR1Provider.derivePublicKey()`（技术复杂度较高）
4. **补充**：增加 `StoredKeyCodec` 校验功能和相关工具方法

通过以上改进，可确保导入的私钥与公钥数据一致性，提升系统安全性和数据完整性。
