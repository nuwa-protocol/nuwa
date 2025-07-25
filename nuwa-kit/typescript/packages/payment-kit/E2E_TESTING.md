# Payment Kit 端到端（E2E）测试方案

> 本文档描述如何在本地或 CI 环境下，对 Rooch 支付通道实现做端到端功能验证，并给出需要的前置改进点与执行步骤。

## 1. 现状概览

| 模块 | 当前状态 | 说明 |
| ---- | -------- | ---- |
| `RoochPaymentChannelContract` | ✅ 已通过合约集成测试 | open / authorize / claim / close 链上流程均可跑通 |
| `TestEnv` & `identity-kit` | ✅ 支持一键启动本地 Rooch 节点 & faucet | `TestEnv.bootstrap()` 已在集成测试中使用 |
| `PaymentChannelClient` | ⚠️ 存在 3 处影响 E2E 的逻辑缺口 | 详见 **2. 必要改进** |

## 2. 必要改进

下列修补需先合入，否则端到端流程将在 RAV 生成或 claim 阶段失败。

1. **✅ 已实现：一步开通通道和子通道**  
   新增 `openChannelWithSubChannel()` 方法，调用合约的 `open_channel_with_sub_channel_entry`，避免分两次交易的 gas 消耗。

2. **✅ 已实现：重构缓存策略**  
   去除 `"default"` 通道概念，改为：
   - 通道元数据以 `channelId` 为键进行缓存
   - 子通道状态以 `keyId` 为键进行缓存
   - 增加 `getChannelsByPayer()` 方法按支付方 DID 查询通道列表

3. **✅ 已实现：链 ID 动态获取**  
   `getChainId()` 现在调用 `this.contract.getChainId()` 并做缓存，而非固定返回 `4`。

4. **（可选）缓存 TTL / 清理**  
   在 `StorageOptions` 中新增 `ttl`，长跑测试结束后可自动清理脏数据。

## 3. E2E 测试流程

完整流程覆盖：资金注入 → 开通通道 → 授权子通道 → 生成并提交 RAV → 关闭通道。

### 3.1 前置条件

| 依赖 | 版本要求 | 备注 |
| ---- | -------- | ---- |
| Node.js | ≥ 18 | 
| Rooch 节点 | 本地 `localnet` 或远程 `devnet/testnet` | 端口默认 `6767` |
| 环境变量 | `PAYMENT_E2E=1` & `ROOCH_NODE_URL=<node_url>` | 用于切换是否执行 e2e |

### 3.2 测试脚手架

在 `packages/payment-kit/src/e2e/`（或原 `rooch/__tests__/`）中新建 `RoochPaymentKit.e2e.test.ts`。

**示例代码摘要**（仅展示关键逻辑，完整见测试文件）：

```ts
if (!process.env.PAYMENT_E2E) {
  console.log('skip e2e');
  return;
}

// 1. 启动测试环境
const env = await TestEnv.bootstrap({ network: 'local', debug: true });
const payer = await createSelfDid(env, { keyType: 'EcdsaSecp256k1VerificationKey2019' });
const payee = await createSelfDid(env, { keyType: 'EcdsaSecp256k1VerificationKey2019' });

// 2. 创建客户端
const client = await createRoochPaymentChannelClient({ kit: payer.kit, debug: true });
const payeeClient = await createRoochPaymentChannelClient({ kit: payee.kit, debug: true });

const ASSET = { assetId: '0x3::gas_coin::RGas' };

// 3. 资金注入
await client.contract.depositToHub({
  targetDid: payer.did,
  asset: ASSET,
  amount: 10_0000_0000n, // 10 RGas
  signer: payer.signer,
});

// 4. 一步开通通道和授权子通道（推荐方式）
const meta = await client.openChannelWithSubChannel({
  payeeDid: payee.did,
  asset: ASSET,
  collateral: 1_0000_0000n,
  keyId: payer.keyIds[0], // 使用第一个密钥
});
expect(meta.status).toBe('active');

// 5. 生成并提交 RAV（现在自动使用正确的 channelId 和 epoch）
const signedRav = await client.nextSubRAV(500_0000n); // 0.05 RGas
const claimRes = await payeeClient.submitClaim(signedRav);
expect(claimRes.claimedAmount).toBe(500_0000n);

// 6. 关闭通道（现在需要明确传入 channelId）
await client.closeChannel(meta.channelId, true);
const info = await client.getChannelInfo(meta.channelId);
expect(info.status).toBe('closed');
```

### 3.3 运行命令

```bash
# 本地节点
ROOCH_NODE_URL=http://localhost:6767 PAYMENT_E2E=1 \
npm run test -- --config jest.config.e2e.ts --runInBand
```

> **提示**：
> 1. `--runInBand` 可避免多进程同时访问同一节点。
> 2. 在 CI 中如需跳过 e2e，仅需不设置 `PAYMENT_E2E` 环境变量。

## 4. 全链路 API 计费场景（推荐）

为了验证 *整个* Payment Kit 在真实「API 计费」业务中的闭环，可在上一节链上流程验证的基础上，增加以下场景。该场景同时覆盖 **客户端 SDK → HTTP 协议 → 服务端结算 → 链上 Claim** 的完整链路。

### 4.1 组件与角色

| 角色 | 功能 | 主要依赖 |
| ---- | ---- | -------- |
| **Billing Server** | 提供示例 REST API（如 `/v1/echo`）。<br/>• 使用 `payment-kit` 的 `HttpHeaderCodec` & `SubRAVValidator` 对每个请求中的 `x-rav` 头进行校验、记账。<br/>• 当累计消费达到阈值（如 1 RGas）或 `nonce` 达到 10 时，自动调用 `claimFromChannel()`。 | Express/Koa 任意框架 |
| **Client Tester** | 通过 `PaymentChannelClient` 生成 `SignedSubRAV`，放入请求头 `x-rav` 调用 Billing Server。 | supertest/axios |
| **Rooch 节点** | 链上结算，复用 `TestEnv.bootstrap()` 本地节点或远程 testnet。 | |

### 4.2 流程概述

1. **启动阶段**：初始化 Rooch 节点；创建 `payer` / `payee` DID；启动 Billing Server。  
2. **链上准备**：执行 `deposit → openChannel → authorizeSubChannel`（步骤同第 3 节）。  
3. **业务调用**：循环 20 次调用 `/v1/echo`，每次扣费 0.01 RGas，并附带新的 `x-rav`。  
4. **服务器结算**：Billing Server 校验 RAV 并记账；当累计 ≥1 RGas 或 `nonce` ≥10 时触发链上 `claimFromChannel`；成功后重置本地累计额。  
5. **断言**：
   * API 成功返回 20 次；
   * 服务端至少触发一次 `claimFromChannel`；
   * 链上 `SubChannel.last_claimed_amount` ≥ 0.2 RGas；
   * 关闭通道后 `status === 'closed'`。

### 4.3 示例目录结构

```
packages/payment-kit/
└─ src/
   └─ e2e/
      ├─ server/
      │   └─ index.ts          # Billing Server 实现（createServer/shutdown）
      └─ PaymentKit.e2e.test.ts # 测试脚本
```

### 4.4 运行方式

```bash
ROOCH_NODE_URL=http://localhost:6767 PAYMENT_E2E=1 \
npm run test -- --config jest.config.e2e.ts --runInBand
```

> **提示**：在 `beforeAll`/`afterAll` 钩子中启动与关闭 Billing Server，确保测试生命周期内端口可用。

## 5. 目录建议

```
packages/payment-kit/
├─ src/
│  ├─ e2e/
│  │  └─ RoochPaymentKit.e2e.test.ts
│  └─ ...
├─ jest.config.e2e.ts   # 专属配置，覆盖 timeout / reporters 等
└─ E2E_TESTING.md       # ← 当前文档
```

## 6. 后续展望

* 完善 SQL / IndexedDB 等持久化存储，实现 TTL 及多会话共享。
* 支持 EVM、Cosmos 等更多链的 `IPaymentChannelContract` 实现，沿用同一 e2e 套件。 