# @nuwa-ai/payment-kit

> SDK for NIP-4 Unidirectional Payment Channels on Rooch and other ledgers

基于《NIP-4 Unidirectional Payment Channel Core》规范以及 Rooch 链上支付通道合约的 TypeScript/JavaScript SDK。

## ✨ 功能特性

- **NIP-4 兼容**: 完整实现 SubRAV (Sub-channel Receipt And Voucher) 协议
- **版本化协议**: 支持 SubRAV 版本控制，确保向后兼容性和协议演进
- **BCS 序列化**: 使用 Rooch 原生 BCS 序列化，确保与链上合约的完全兼容
- **多设备支持**: 支持单一通道内的多个子通道，每个绑定不同的验证方法
- **链兼容**: 抽象化设计，当前支持 Rooch，未来可扩展到其他区块链
- **HTTP Gateway**: 内置 `X-Payment-Channel-Data` 头处理，支持 HTTP 服务集成
- **类型安全**: 100% TypeScript 实现，提供完整的类型定义

## 📦 安装

```bash
npm install @nuwa-ai/payment-kit @nuwa-ai/identity-kit @roochnetwork/rooch-sdk
```

## 🚀 快速开始

### 基本用法

```typescript
import { IdentityKit } from '@nuwa-ai/identity-kit';
import { createRoochPaymentChannelClient } from '@nuwa-ai/payment-kit';

// 1) 初始化身份环境（已确定 Rooch 网络和 rpcUrl）
const env = await IdentityKit.bootstrap({
  method: 'rooch',
  vdrOptions: { rpcUrl: 'https://test-seed.rooch.network' },
});

const kit = await env.loadDid('did:rooch:0xabc...');
const keyId = (await kit.getAvailableKeyIds()).authentication![0];

// 2) 使用 helper 一步创建支付通道客户端（无需显式 rpcUrl）
const pcClient = await createRoochPaymentChannelClient({
  kit,
  keyId,
});

// 3) 开通道并授权子通道
await pcClient.openChannel({
  payeeDid: 'did:rooch:0xdef...',
  asset: { assetId: '0x3::gas_coin::RGas', symbol: 'RGAS' },
  collateral: BigInt('1000000000000000000'), // 1 RGAS
});

await pcClient.authorizeSubChannel({
  vmIdFragment: 'laptop-key'
});

// 4) 生成支付收据
const subRAV = await pcClient.nextSubRAV(BigInt('5000000000000000')); // 0.005 RGAS
console.log('Payment created:', subRAV);

// 5) 验证和提取
const isValid = await SubRAVSigner.verify(subRAV, resolver);
if (isValid) {
  await pcClient.submitClaim(subRAV);
}
```

### HTTP Gateway 集成

```typescript
import { HttpHeaderCodec } from '@nuwa-ai/payment-kit';

// 客户端: 构建请求头
const requestHeader = HttpHeaderCodec.buildRequestHeader({
  channelId: '0x1234...',
  signedSubRav: latestSubRAV,
  maxAmount: BigInt('10000000000000000'),
  clientTxRef: 'client-req-001'
});

// HTTP 请求
fetch('/api/service', {
  headers: {
    'X-Payment-Channel-Data': requestHeader,
    'Content-Type': 'application/json'
  },
  body: JSON.stringify({ query: 'data' })
});

// 服务端: 解析和响应
const parsed = HttpHeaderCodec.parseRequestHeader(requestHeader);
// ... 处理业务逻辑 ...
const responseHeader = HttpHeaderCodec.buildResponseHeader({
  signedSubRav: updatedSubRAV,
  amountDebited: BigInt('5000000000000000'),
  serviceTxRef: 'srv-resp-001'
});
```

## 🛠️ API 参考

### 核心类型

```typescript
interface SubRAV {
  version: number;          // Protocol version (default: 1)
  chainId: bigint;
  channelId: string;        // 32-byte hex string
  channelEpoch: bigint;
  vmIdFragment: string;     // DID verification method fragment
  accumulatedAmount: bigint;
  nonce: bigint;
}

interface SignedSubRAV {
  subRav: SubRAV;
  signature: Uint8Array;
}
```

### RoochPaymentChannelClient

```typescript
class RoochPaymentChannelClient {
  constructor(options: {
    rpcUrl: string;
    signer: SignerInterface;
    keyId?: string;
  });

  // 通道生命周期
  openChannel(params: OpenChannelParams): Promise<ChannelMetadata>;
  authorizeSubChannel(params: AuthorizeParams): Promise<void>;
  closeChannel(cooperative?: boolean): Promise<void>;

  // 支付操作
  nextSubRAV(deltaAmount: bigint): Promise<SignedSubRAV>;
  submitClaim(signedSubRAV: SignedSubRAV): Promise<TransactionResult>;

  // 状态查询
  getChannelStatus(): Promise<ChannelStatus>;
  getSubChannelStatus(vmIdFragment: string): Promise<SubChannelStatus>;
}
```

### SubRAVSigner

```typescript
class SubRAVSigner {
  static async sign(
    subRav: SubRAV,
    signer: SignerInterface,
    keyId: string
  ): Promise<SignedSubRAV>;

  static async verify(
    signedSubRAV: SignedSubRAV,
    resolver: DIDResolver
  ): Promise<boolean>;
}
```

### SubRAV BCS 序列化

```typescript
import { SubRAVCodec, SubRAVUtils } from '@nuwa-ai/payment-kit';

// 创建 SubRAV (自动使用当前版本)
const subRav = SubRAVUtils.create({
  chainId: BigInt(4),
  channelId: '0x1234...',
  channelEpoch: BigInt(0),
  vmIdFragment: 'device-key',
  accumulatedAmount: BigInt(1000),
  nonce: BigInt(1),
});

// BCS 序列化
const encoded = SubRAVCodec.encode(subRav);
const hex = SubRAVCodec.toHex(subRav);

// 反序列化
const decoded = SubRAVCodec.decode(encoded);
const fromHex = SubRAVCodec.fromHex(hex);
```

## 📁 项目结构

```
src/
├── core/                   # 链无关的协议实现
│   ├── types.ts           # 核心类型定义
│   ├── subrav.ts          # SubRAV BCS 序列化、生成和验证
│   └── http-header.ts     # HTTP Gateway Profile 实现
├── rooch/                 # Rooch 链特定实现
│   ├── contract.ts        # Move 合约调用封装
│   └── client.ts          # 高层次客户端 API
├── utils/                 # 工具函数
└── __tests__/             # 测试文件
```

## 🔧 开发

### 构建

```bash
cd nuwa-kit/typescript/packages/payment-kit
npm run build
```

### 测试

```bash
# 单元测试
npm test

# 集成测试 (需要本地 Rooch 节点)
npm run test:integration
```

### 依赖的 Move 合约

本 SDK 依赖部署在 Rooch 链上的支付通道 Move 合约。合约源码位于 `contracts/move/` 目录。

## 📄 设计文档

详细的设计文档请参考：[DESIGN.md](./DESIGN.md)

## 📄 许可证

Apache-2.0

```