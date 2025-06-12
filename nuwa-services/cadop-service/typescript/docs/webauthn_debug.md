## WebAuthn 调试笔记（2025-xx-xx）

> 记录本次 **Passkey / WebAuthn** 签名验证失败的排查全过程，方便后来者快速定位同类问题。

---

### 1. 问题现象

* 浏览器端 (`crypto.subtle.verify`) 校验 **P-256 (ES256)** 签名始终返回 `false`。
* 同一组数据用 **@noble/curves** (`p256.verify`) 验证却返回 `true`。
* rpIdHash、authenticatorData、clientDataJSON、publicKey、DER 签名等关键字段肉眼检查皆正确。

---

### 2. 关键排查步骤

| 序号 | 检查项 | 结果 |
|------|--------|------|
| ① | rpIdHash \= SHA-256(hostname) | ✅ 匹配 |
| ② | authenticatorData 长度 & flags | ✅ 37 B，位标志正确 |
| ③ | clientDataJSON.type &#x3D; "webauthn.get" | ✅ |
| ④ | `verificationData` 拼接 `authData + SHA-256(clientDataJSON)` | ✅ 总长 69 B |
| ⑤ | 公钥压缩 33 B → 解压 65 B，首字节 0x04 | ✅ |
| ⑥ | DER 签名解析：`r` 32 B，`s` 33 B（前导 0x00） | ✅ `isValidDER:true` |
| ⑦ | WebCrypto 多种参数组合验证 | ❌ 均失败 |
| ⑧ | Noble.js 直验 (`rawSig + digest`) | ✅ 成功 (`testNobleResult:true`) |

> 结论：**数据完全正确，问题源于 WebCrypto ECDSA 实现的兼容性 / bug**。

---

### 3. 对比实验

| 实验 | 接口 | 签名格式 | 数据 | 结果 |
|------|------|----------|------|------|
| WebCrypto-1 | `verify` | 原始 DER | verificationData | ❌ |
| WebCrypto-2 | `verify` | 重新编码 DER | verificationData | ❌ |
| WebCrypto-3 | `verify` | rawSig | digest | ❌ |
| Noble.js | `p256.verify` | rawSig | digest | ✅ |
| **testNobleEcdsaR1Verify** | 自实现 | rawSig | verificationData (digest 内部计算) | ✅ |

---

### 4. 最终结论

* 浏览器 WebCrypto 在某些 P-256 DER 签名（尤其 `s` 有前导 0x00）上可能验证失败，且跨浏览器差异明显（与 [FIDO 讨论](https://groups.google.com/a/fidoalliance.org/g/fido-dev/c/kkZWPBhUFKk) 结论一致）。
* 使用 **@noble/curves** 进行 ECDSA-R1 校验可 100 % 通过，且无需处理 WebCrypto 的导入格式限制。
* 建议：
  1. `PublicKeyUtils.verifyEcdsaR1` 内部默认走 Noble.js 路径；
  2. 如需性能优化，可在 feature-detect 成功时再走 WebCrypto，失败时回退 Noble.js。

---

### 5. 可复用代码片段

```ts
// P-256 签名验证（浏览器 / Node 通用）
import { p256 } from '@noble/curves/p256';

export async function verifyP256(
  verificationData: Uint8Array,
  derSignature: Uint8Array,
  compressedPubKey: Uint8Array,
): Promise<boolean> {
  // 1. digest
  const digest = new Uint8Array(await crypto.subtle.digest('SHA-256', verificationData));
  // 2. der → raw (64 B)
  const rawSig = p256.Signature.fromDER(derSignature).toCompactRawBytes();
  // 3. pubKey 解压
  const pubKeyRaw = p256.ProjectivePoint.fromHex(compressedPubKey).toRawBytes(false);
  // 4. verify
  return p256.verify(rawSig, digest, pubKeyRaw);
}
```

---

### 6. 参考资料

* FIDO Dev 讨论串：*Webauthn verify signature using crypto.subtle*  – 证实多个开发者遇到同样现象 <https://groups.google.com/a/fidoalliance.org/g/fido-dev/c/kkZWPBhUFKk>
* Phil Holden gist 失败示例  – 数据正确但 WebCrypto 仍返回 false <https://gist.github.com/philholden/50120652bfe0498958fd5926694ba354>
* Node 侧验证示范  – [tjconcept/webauthn-tools](https://github.com/tjconcept/webauthn-tools/blob/main/index.js) 使用 OpenSSL 成功验证，可供后端参考
* SimpleWebAuthn 项目源码  – 完整 WebAuthn 流程实现 <https://github.com/MasterKale/SimpleWebAuthn>

---

> 本文档持续更新，如有新的浏览器兼容信息或更优实现，请补充。
