# WebAuthn 测试工具使用指南

## 概述

这套工具用于验证前端 WebAuthnSigner.ts 与链上 Move 合约 webauthn_validator.move 之间的签名格式一致性。

## 文件说明

1. **WebAuthnSigner.ts** - 已修改，增加详细日志输出
2. **webauthn_validator_test.move** - Move 测试用例，包含数据验证逻辑
3. **webauthn-test-validator.ts** - TypeScript 验证脚本，用于本地验证数据一致性

## 使用步骤

### 1. 获取真实 WebAuthn 数据

1. 在浏览器中使用 WebAuthnSigner 进行签名操作
2. 查看控制台输出，找到以下格式的日志：

```
=== WebAuthn Test Data for Move Test Case ===
authenticator_data_hex: 49960de5880e8c687434170f6476605b8fe4aeb9a28632c7995cf3ba831d97630500000000
client_data_json_hex: 7b2274797065223a22776562617574686e2e676574222c226368616c6c656e6765223a...
signature_raw_hex: a1b2c3d4e5f6... (64 bytes, already converted from DER)
public_key_compressed_hex: 0258a618066814098f8ddb3cbde73838b59028d843958031e50be0a5f4b0a9796d
client_data_hash_hex: 1234567890abcdef...
verification_message_hex: 49960de5880e8c687434170f6476605b8fe4aeb9a28632c7995cf3ba831d97630500000000...
=== End WebAuthn Test Data ===
```

### 2. 本地验证数据一致性

1. 将获取的数据填入 `webauthn-test-validator.ts` 中的 `exampleData`
2. 运行验证脚本：
```bash
npx ts-node webauthn-test-validator.ts
```
3. 确保所有验证通过

### 3. 更新 Move 测试用例

1. 将验证通过的数据填入 `webauthn_validator_test.move` 中的 `get_real_webauthn_test_vector()` 函数
2. 替换所有 `PLACEHOLDER_*_HEX` 占位符
3. 运行 Move 测试：
```bash
rooch move test
```

## 关键验证点

1. **签名格式**: Raw 格式 (64 bytes, r||s)，前端已从 DER 转换
2. **公钥格式**: 33 bytes 压缩格式
3. **消息构造**: authenticatorData || SHA-256(clientDataJSON)
4. **ECDSA-R1 验证**: 使用 P-256 曲线验证签名

## 常见问题

- **签名长度错误**: 确保传入合约的是 Raw 签名 (64 bytes)，而不是 DER 格式
- **公钥格式错误**: 确保使用压缩格式 (33 bytes)，前缀为 0x02 或 0x03
- **消息拼接错误**: 确保使用 SHA-256(clientDataJSON) 而不是原始 clientDataJSON

## 测试数据格式

所有十六进制字符串应为小写，不包含 0x 前缀，例如：
- ✅ `"deadbeef"`
- ❌ `"0xDEADBEEF"`
- ❌ `"DEADBEEF"` 