# Agent Balance 管理和转账功能设计方案

## 文档信息

- **创建日期**: 2025-12-09
- **状态**: 设计阶段
- **相关页面**: Agent Detail (`src/pages/agent-detail.tsx`)
- **相关合约**: `rooch_framework::payment_channel`

## 一、概述

本文档描述 Agent Detail 页面中两种余额（Account Balance 和 Payment Hub Balance）的优化方案，以及实现四种转账功能的技术设计。

### 1.1 背景

当前 Agent Detail 页面显示两个余额：
1. **Account Balance (账户余额)**: Agent 的链上账户余额，用于普通交易
2. **Payment Hub Balance**: 专门用于状态通道的余额，支持快速微支付

用户对这两个余额的区别和用途不够清楚，同时缺少必要的转账功能。

### 1.2 目标

1. **优化余额描述**: 让用户清楚了解两种余额的区别和用途
2. **实现四种转账**: 
   - 账户余额 → 其他地址账户余额
   - Payment Hub → 其他地址 Payment Hub
   - 账户余额 → Payment Hub (充值)
   - Payment Hub → 账户余额 (提现)

## 二、Balance 描述优化

### 2.1 当前问题

- **Account Balance**: 仅显示为 "余额"，用户不清楚这是普通账户余额
- **Payment Hub Balance**: 显示为 "PaymentHub"，用户不理解这是用于状态通道的专用余额
- 缺少说明文字，用户难以理解两者的区别

### 2.2 优化方案

#### Account Balance (账户余额)

**中文标题**: "链上余额" 或 "账户余额"

**说明文字**: "用于日常转账和交易的可用余额"

**英文标题**: "Account Balance"

**说明文字**: "Available balance for transfers and transactions"

**UI 设计**:
- 添加信息图标 (i) 和 Tooltip
- Tooltip 内容：
  - 中文: "这是您的链上账户余额，可用于普通转账、支付 gas 费用等链上操作"
  - 英文: "This is your on-chain account balance, available for regular transfers, gas fees, and other on-chain operations"

#### Payment Hub Balance (支付通道余额)

**中文标题**: "支付通道余额"

**说明文字**: "专用于快速支付通道的锁定余额，支持即时小额支付"

**英文标题**: "Payment Channel Balance"

**说明文字**: "Reserved balance for fast payment channels, supporting instant micro-payments"

**UI 设计**:
- 添加信息图标 (i) 和 Tooltip
- Tooltip 内容：
  - 中文: "这是专用于支付通道的余额。支付通道允许快速、低成本的小额支付，无需每次都提交链上交易。当有活跃通道时，部分余额会被锁定作为保证金。"
  - 英文: "This is the balance dedicated to payment channels. Payment channels enable fast, low-cost micro-payments without submitting on-chain transactions each time. When channels are active, a portion of the balance is locked as collateral."

**额外信息**:
- 显示活跃通道数量: "活跃通道: X"
- 如果有锁定余额，显示: "总余额: X (锁定: Y)"

### 2.3 实现细节

#### i18n 更新

在 `src/i18n/locales/zh.json` 添加:
```json
{
  "agent": {
    "accountBalance": "账户余额",
    "accountBalanceDesc": "用于日常转账和交易的可用余额",
    "accountBalanceTooltip": "这是您的链上账户余额，可用于普通转账、支付 gas 费用等链上操作",
    "paymentChannelBalance": "支付通道余额",
    "paymentChannelBalanceDesc": "专用于快速支付通道的锁定余额",
    "paymentChannelBalanceTooltip": "这是专用于支付通道的余额。支付通道允许快速、低成本的小额支付，无需每次都提交链上交易。当有活跃通道时，部分余额会被锁定作为保证金。",
    "totalBalance": "总余额",
    "lockedBalance": "锁定",
    "activeChannels": "活跃通道",
    "availableBalance": "可用余额"
  }
}
```

在 `src/i18n/locales/en.json` 添加:
```json
{
  "agent": {
    "accountBalance": "Account Balance",
    "accountBalanceDesc": "Available balance for transfers and transactions",
    "accountBalanceTooltip": "This is your on-chain account balance, available for regular transfers, gas fees, and other on-chain operations",
    "paymentChannelBalance": "Payment Channel Balance",
    "paymentChannelBalanceDesc": "Reserved balance for fast payment channels",
    "paymentChannelBalanceTooltip": "This is the balance dedicated to payment channels. Payment channels enable fast, low-cost micro-payments without submitting on-chain transactions each time. When channels are active, a portion of the balance is locked as collateral.",
    "totalBalance": "Total Balance",
    "lockedBalance": "Locked",
    "activeChannels": "Active Channels",
    "availableBalance": "Available Balance"
  }
}
```

#### 卡片布局设计

```
┌──────────────────────────────────────────┐
│ 账户余额 (i)                              │
│ 用于日常转账和交易的可用余额               │
│ ──────────────────────────────────────   │
│ RGAS: 100.00                             │
│                                          │
│ [转账]  [充值到支付通道]                  │
└──────────────────────────────────────────┘

┌──────────────────────────────────────────┐
│ 支付通道余额 (i)                          │
│ 专用于快速支付通道的锁定余额               │
│ ──────────────────────────────────────   │
│ RGAS: 50.00 (锁定: 10.00)                │
│ 活跃通道: 2                               │
│                                          │
│ [转账]  [提现]                            │
└──────────────────────────────────────────┘
```

## 三、四种转账功能设计

### 3.1 账户余额 → 其他地址账户余额 (普通转账)

#### 功能描述

从 Agent 的链上账户余额转账到其他 Rooch 地址的账户余额。

#### 技术方案

**合约函数**: `account_coin_store::transfer<CoinType>(to: address, amount: u256)`

**实现方式**:
- 使用 Rooch SDK 构建交易
- 通过 `didService.getSigner()` 获取签名器
- 使用 `signer.signAndExecuteTransaction()` 执行交易

#### 代码示例

```typescript
// hooks/useAccountTransfer.ts
import { Transaction, Args } from '@roochnetwork/rooch-sdk';
import { useDIDService } from './useDIDService';

export function useAccountTransfer(agentDid?: string) {
  const { didService } = useDIDService(agentDid);
  
  const transfer = async (
    recipient: string,
    amount: bigint,
    coinType: string
  ) => {
    if (!didService) throw new Error('DID service not available');
    
    const signer = didService.getSigner();
    const tx = new Transaction();
    
    tx.callFunction({
      target: '0x3::account_coin_store::transfer',
      typeArgs: [coinType],
      args: [Args.address(recipient), Args.u256(amount)],
    });
    
    const result = await signer.signAndExecuteTransaction({
      transaction: tx,
    });
    
    return {
      txHash: result.execution_info.tx_hash,
      success: result.execution_info.status.type === 'executed',
    };
  };
  
  return { transfer };
}
```

#### UI 设计

**按钮位置**: Account Balance 卡片底部

**对话框内容**:
- 标题: "转账" / "Transfer"
- 接收地址输入框
  - 支持 Rooch 地址格式 (0x...)
  - 支持 DID 格式 (did:rooch:...)
  - 地址验证
- 金额输入框
  - 显示当前可用余额
  - 输入验证 (最大金额、最小金额)
  - 快捷选择: 25%, 50%, 75%, 100%
- 代币选择 (如果有多种代币)
- Gas 费用估算显示
- 确认按钮

**交互流程**:
1. 用户点击 "转账" 按钮
2. 打开对话框
3. 输入接收地址和金额
4. 实时验证输入
5. 显示确认信息
6. 执行转账
7. 显示进度 (pending → success/failed)
8. 成功后刷新余额，关闭对话框

#### 实现文件

- 组件: `src/components/balance/TransferAccountModal.tsx`
- Hook: `src/hooks/useAccountTransfer.ts`
- 类型定义: `src/types/transfer.ts` (可选)

---

### 3.2 Payment Hub → 其他地址 Payment Hub (通道间转账)

#### 功能描述

从 Agent 的 Payment Hub 余额转账到其他地址的 Payment Hub。这允许用户在不提现到账户的情况下，直接在 Payment Hub 之间转移资金。

#### 技术方案

**合约函数**: `payment_channel::transfer_to_hub_entry<CoinType>(sender: &signer, receiver: address, amount: u256)`

**重要**: 此功能需要扩展 payment-kit，因为当前 SDK 中没有封装此方法。

**扩展步骤**:

1. **在 `IPaymentChannelContract.ts` 添加接口**:

```typescript
export interface TransferToHubParams {
  senderDid: string;
  receiverDid: string;
  assetId: string;
  amount: bigint;
  signer: SignerInterface;
}

export interface IPaymentChannelContract {
  // ... 现有方法
  
  /**
   * Transfer funds from sender's payment hub to receiver's payment hub
   */
  transferToHub(params: TransferToHubParams): Promise<TxResult>;
}
```

2. **在 `RoochPaymentChannelContract.ts` 实现**:

```typescript
async transferToHub(params: TransferToHubParams): Promise<TxResult> {
  const { senderDid, receiverDid, assetId, amount, signer } = params;
  
  // Convert DID to address
  const receiverAddress = this.didToAddress(receiverDid);
  
  const tx = new Transaction();
  tx.callFunction({
    target: `${this.contractAddress}::payment_channel::transfer_to_hub_entry`,
    typeArgs: [assetId],
    args: [Args.address(receiverAddress), Args.u256(amount)],
  });
  
  const result = await signer.signAndExecuteTransaction({
    transaction: tx,
  });
  
  return {
    txHash: result.execution_info.tx_hash,
    blockHeight: BigInt(result.execution_info.block_number || 0),
  };
}
```

3. **在 `PaymentHubClient.ts` 添加方法**:

```typescript
/**
 * Transfer funds from this hub to another address's payment hub
 */
async transfer(
  recipientDid: string,
  assetId: string,
  amount: bigint
): Promise<{ txHash: string }> {
  const senderDid = await this.signer.getDid();
  
  const params: TransferToHubParams = {
    senderDid,
    receiverDid: recipientDid,
    assetId,
    amount,
    signer: this.signer,
  };
  
  const result = await this.contract.transferToHub(params);
  return { txHash: result.txHash };
}
```

#### 余额检查

转账前需要检查 **unlocked balance** (可用余额)，而不是总余额。

可用余额 = 总余额 - 锁定余额

锁定余额 = 活跃通道数 × 每通道锁定单位

合约提供了查询函数: `get_unlocked_balance_in_hub`

#### UI 设计

**按钮位置**: Payment Hub 卡片底部

**对话框内容**:
- 标题: "转账到 Payment Hub" / "Transfer to Payment Hub"
- 接收地址输入框 (DID 或 Rooch 地址)
- 金额输入框
  - 显示可用余额 (总余额 - 锁定余额)
  - 如果有锁定余额，提示: "当前有 X 个活跃通道，锁定了 Y RGAS"
- 说明文字: "转账到对方的支付通道余额，对方可用于支付通道交易"
- 确认按钮

**交互流程**: 同账户转账

#### 实现文件

- 扩展: `nuwa-kit/typescript/packages/payment-kit/src/contracts/IPaymentChannelContract.ts`
- 扩展: `nuwa-kit/typescript/packages/payment-kit/src/rooch/RoochPaymentChannelContract.ts`
- 扩展: `nuwa-kit/typescript/packages/payment-kit/src/client/PaymentHubClient.ts`
- 组件: `src/components/balance/TransferHubModal.tsx`
- Hook: `src/hooks/useHubTransfer.ts`

---

### 3.3 账户余额 → Payment Hub (充值)

#### 功能描述

从 Agent 的链上账户余额充值到自己的 Payment Hub。这是为支付通道准备资金的主要方式。

#### 技术方案

**合约函数**: `payment_channel::deposit_to_hub_entry<CoinType>(sender: &signer, receiver: address, amount: u256)`

**现有支持**: PaymentHubClient 已有 `deposit` 方法，可直接使用。

#### 代码示例

```typescript
// 使用现有的 PaymentHubClient
const { hubClient } = usePaymentHubClient(agentDid);

const depositToHub = async (amount: bigint, assetId: string) => {
  if (!hubClient) throw new Error('Hub client not available');
  
  const ownerDid = await hubClient.signer.getDid();
  const result = await hubClient.deposit(assetId, amount, ownerDid);
  
  return result;
};
```

#### UI 设计

**按钮位置**: 
- 选项 1: Account Balance 卡片底部 (推荐)
- 选项 2: 在两个卡片之间添加一个向下箭头图标按钮
- 选项 3: Payment Hub 卡片顶部

**对话框内容**:
- 标题: "充值到支付通道" / "Deposit to Payment Channel"
- 金额输入框
  - 显示账户可用余额
  - 快捷选择: 25%, 50%, 75%, 100%
- 说明文字: 
  - 中文: "将资金从账户余额转入支付通道，用于快速支付。充值后可以开通支付通道，进行即时小额支付。"
  - 英文: "Transfer funds from account balance to payment channel for fast payments. After depositing, you can open payment channels for instant micro-payments."
- 建议充值金额提示 (可选): "建议至少充值 X RGAS 以开通支付通道"
- 确认按钮

**交互流程**:
1. 用户点击 "充值到支付通道" 按钮
2. 打开对话框，显示当前账户余额
3. 输入充值金额
4. 显示充值后的 Payment Hub 预估余额
5. 确认并执行充值
6. 显示进度
7. 成功后刷新两个余额，关闭对话框

#### 实现文件

- 组件: `src/components/balance/DepositToHubModal.tsx`
- Hook: 复用 `usePaymentHubClient`

---

### 3.4 Payment Hub → 账户余额 (提现)

#### 功能描述

从 Agent 的 Payment Hub 提现到自己的链上账户余额。只能提现未锁定的余额。

#### 技术方案

**合约函数**: `payment_channel::withdraw_from_hub_entry<CoinType>(owner: &signer, amount: u256)`

**现有支持**: PaymentHubClient 已有 `withdraw` 方法，可直接使用。

**重要限制**: 只能提现 unlocked balance (可用余额)。如果有活跃通道，部分余额会被锁定作为保证金，无法提现。

#### 余额计算

```
总余额 = Payment Hub Balance
锁定余额 = 活跃通道数 × 每通道锁定单位
可提现余额 = 总余额 - 锁定余额
```

合约会自动检查余额限制，如果尝试提现超过可用余额，交易会失败。

#### 代码示例

```typescript
const { hubClient } = usePaymentHubClient(agentDid);
const { activeCounts } = usePaymentHubBalances(agentDid);

const withdrawFromHub = async (amount: bigint, assetId: string) => {
  if (!hubClient) throw new Error('Hub client not available');
  
  // amount = 0 表示提现全部可用余额
  const result = await hubClient.withdraw(assetId, amount);
  
  return result;
};
```

#### UI 设计

**按钮位置**: Payment Hub 卡片底部

**对话框内容**:
- 标题: "提现到账户" / "Withdraw to Account"
- 余额信息显示:
  - 总余额: X RGAS
  - 锁定余额: Y RGAS (活跃通道: N)
  - 可提现余额: Z RGAS
- 金额输入框
  - 最大值限制为可提现余额
  - 快捷选择: 25%, 50%, 75%, 100% (基于可提现余额)
- 说明文字:
  - 中文: "将资金从支付通道转回账户余额。注意: 有活跃通道时，部分余额会被锁定无法提现。如需提现更多资金，请先关闭相关支付通道。"
  - 英文: "Transfer funds from payment channel back to account balance. Note: When channels are active, a portion of the balance is locked and cannot be withdrawn. To withdraw more funds, please close related payment channels first."
- 如果锁定余额 > 0，显示警告图标和提示
- 确认按钮

**特殊情况处理**:
- 如果可提现余额为 0，禁用输入框和确认按钮，显示提示: "当前无可提现余额，请先关闭支付通道"

**交互流程**:
1. 用户点击 "提现" 按钮
2. 打开对话框，自动计算并显示可提现余额
3. 输入提现金额 (受可提现余额限制)
4. 显示提现后的账户预估余额
5. 确认并执行提现
6. 显示进度
7. 成功后刷新两个余额，关闭对话框

#### 实现文件

- 组件: `src/components/balance/WithdrawFromHubModal.tsx`
- Hook: 复用 `usePaymentHubClient` 和 `usePaymentHubBalances`

---

## 四、通用 UI/UX 设计

### 4.1 对话框通用设计

所有转账对话框遵循统一的设计模式:

#### 布局结构

```
┌─────────────────────────────────────┐
│  [X] 标题                            │
├─────────────────────────────────────┤
│                                     │
│  说明文字 (可选)                     │
│                                     │
│  ┌─────────────────────────────┐   │
│  │ 接收地址 (如果适用)          │   │
│  └─────────────────────────────┘   │
│                                     │
│  ┌─────────────────────────────┐   │
│  │ 金额                        │   │
│  │                   [25%] ... │   │
│  └─────────────────────────────┘   │
│  可用: XXX RGAS                     │
│                                     │
│  余额信息 / 提示信息                 │
│                                     │
│  ┌───────────────────────────────┐ │
│  │ 确认信息                       │ │
│  │ • 从: XXX                      │ │
│  │ • 到: XXX                      │ │
│  │ • 金额: XXX RGAS               │ │
│  │ • 预估 Gas: XXX                │ │
│  └───────────────────────────────┘ │
│                                     │
│            [取消]  [确认转账]        │
└─────────────────────────────────────┘
```

#### 状态管理

所有转账对话框需要处理以下状态:

```typescript
enum TransferStatus {
  IDLE = 'idle',           // 初始状态
  VALIDATING = 'validating', // 验证输入
  CONFIRMING = 'confirming', // 等待用户确认
  PENDING = 'pending',     // 交易进行中
  SUCCESS = 'success',     // 交易成功
  FAILED = 'failed',       // 交易失败
}
```

#### 进度显示

交易执行时显示进度:
1. 准备交易...
2. 等待签名...
3. 提交交易...
4. 确认中... (显示交易 hash)
5. 完成 / 失败

### 4.2 输入验证

#### 地址验证

```typescript
function isValidRoochAddress(address: string): boolean {
  // Rooch 地址格式: 0x + 64 位十六进制
  return /^0x[a-fA-F0-9]{64}$/.test(address);
}

function isValidDID(did: string): boolean {
  // DID 格式: did:rooch:0x...
  return /^did:rooch:0x[a-fA-F0-9]{64}$/.test(did);
}

function normalizeAddress(input: string): string {
  if (isValidDID(input)) {
    return input.split(':')[2]; // 提取地址部分
  }
  if (isValidRoochAddress(input)) {
    return input;
  }
  throw new Error('Invalid address format');
}
```

#### 金额验证

```typescript
function validateAmount(
  amount: string,
  maxAmount: bigint,
  decimals: number
): { valid: boolean; error?: string } {
  const amountBigInt = parseAmount(amount, decimals);
  
  if (amountBigInt <= 0n) {
    return { valid: false, error: '金额必须大于 0' };
  }
  
  if (amountBigInt > maxAmount) {
    return { valid: false, error: '金额超过可用余额' };
  }
  
  return { valid: true };
}
```

### 4.3 错误处理

#### 错误类型

```typescript
enum TransferErrorType {
  INSUFFICIENT_BALANCE = 'insufficient_balance',
  INVALID_ADDRESS = 'invalid_address',
  INVALID_AMOUNT = 'invalid_amount',
  NETWORK_ERROR = 'network_error',
  TRANSACTION_FAILED = 'transaction_failed',
  USER_REJECTED = 'user_rejected',
  UNKNOWN = 'unknown',
}
```

#### 错误消息

```typescript
const ERROR_MESSAGES = {
  zh: {
    insufficient_balance: '余额不足',
    invalid_address: '地址格式错误',
    invalid_amount: '金额无效',
    network_error: '网络错误，请重试',
    transaction_failed: '交易失败',
    user_rejected: '用户取消了交易',
    unknown: '未知错误',
  },
  en: {
    insufficient_balance: 'Insufficient balance',
    invalid_address: 'Invalid address format',
    invalid_amount: 'Invalid amount',
    network_error: 'Network error, please retry',
    transaction_failed: 'Transaction failed',
    user_rejected: 'User rejected the transaction',
    unknown: 'Unknown error',
  },
};
```

#### 错误处理函数

```typescript
function handleTransferError(error: any, t: TFunction): string {
  // 解析 Rooch SDK 错误
  if (error?.message?.includes('insufficient balance')) {
    return t('transfer.error.insufficient_balance');
  }
  
  if (error?.message?.includes('user rejected')) {
    return t('transfer.error.user_rejected');
  }
  
  // 网络错误
  if (error?.code === 'NETWORK_ERROR') {
    return t('transfer.error.network_error');
  }
  
  // 默认错误
  return error?.message || t('transfer.error.unknown');
}
```

### 4.4 Toast 通知

使用统一的 Toast 提示:

```typescript
// 成功
toast({
  variant: 'success',
  title: '转账成功',
  description: `已转账 ${amount} RGAS 到 ${formatAddress(recipient)}`,
});

// 失败
toast({
  variant: 'destructive',
  title: '转账失败',
  description: errorMessage,
});

// 进行中
toast({
  variant: 'default',
  title: '转账进行中',
  description: '请稍候...',
});
```

## 五、实现步骤

### Phase 1: 基础设施准备

#### Step 1.1: 扩展 Payment-Kit (如果需要 Hub 转账)

**文件**: 
- `nuwa-kit/typescript/packages/payment-kit/src/contracts/IPaymentChannelContract.ts`
- `nuwa-kit/typescript/packages/payment-kit/src/rooch/RoochPaymentChannelContract.ts`
- `nuwa-kit/typescript/packages/payment-kit/src/client/PaymentHubClient.ts`

**任务**:
1. 添加 `TransferToHubParams` 接口
2. 在 `IPaymentChannelContract` 添加 `transferToHub` 方法签名
3. 在 `RoochPaymentChannelContract` 实现 `transferToHub` 方法
4. 在 `PaymentHubClient` 添加 `transfer` 便捷方法

**验收标准**:
- TypeScript 编译通过
- 接口定义清晰
- 实现符合 Rooch 合约调用规范

#### Step 1.2: 更新 i18n

**文件**:
- `src/i18n/locales/zh.json`
- `src/i18n/locales/en.json`

**任务**:
添加所有新的翻译 key (见第二章)

**验收标准**:
- 中英文翻译完整
- 没有拼写错误
- 翻译准确达意

### Phase 2: 创建 Hooks

#### Step 2.1: 创建 `useAccountTransfer`

**文件**: `src/hooks/useAccountTransfer.ts`

**功能**:
- 提供账户转账方法
- 处理交易状态
- 错误处理

**接口**:
```typescript
export interface UseAccountTransferResult {
  transfer: (recipient: string, amount: bigint, coinType: string) => Promise<TransferResult>;
  isLoading: boolean;
  error: string | null;
}
```

#### Step 2.2: 创建 `useHubTransfer`

**文件**: `src/hooks/useHubTransfer.ts`

**功能**:
- 提供 Hub 转账方法
- 检查可用余额 (unlocked balance)
- 处理交易状态

**接口**:
```typescript
export interface UseHubTransferResult {
  transfer: (recipientDid: string, amount: bigint, assetId: string) => Promise<TransferResult>;
  availableBalance: bigint;
  lockedBalance: bigint;
  isLoading: boolean;
  error: string | null;
}
```

### Phase 3: 创建 UI 组件

#### Step 3.1: 创建通用组件

**文件**: `src/components/balance/TransferModalBase.tsx`

创建可复用的基础对话框组件，包含:
- 对话框框架
- 地址输入组件
- 金额输入组件
- 确认信息展示
- 进度显示

#### Step 3.2: 创建四个具体对话框

**文件**:
1. `src/components/balance/TransferAccountModal.tsx`
2. `src/components/balance/TransferHubModal.tsx`
3. `src/components/balance/DepositToHubModal.tsx`
4. `src/components/balance/WithdrawFromHubModal.tsx`

**每个组件的属性接口**:
```typescript
interface TransferModalProps {
  open: boolean;
  onClose: () => void;
  agentDid: string;
  coinType: string;
  currentBalance: bigint;
  onSuccess?: () => void;
}
```

### Phase 4: 更新 Agent Detail 页面

#### Step 4.1: 优化余额卡片

**文件**: `src/pages/agent-detail.tsx`

**任务**:
1. 更新 Account Balance 卡片:
   - 修改标题为 "账户余额"
   - 添加说明文字
   - 添加 Tooltip
   - 添加 "转账" 和 "充值到支付通道" 按钮

2. 更新 Payment Hub 卡片:
   - 修改标题为 "支付通道余额"
   - 添加说明文字
   - 添加 Tooltip
   - 显示锁定余额 (如果有)
   - 显示活跃通道数
   - 添加 "转账" 和 "提现" 按钮

#### Step 4.2: 集成对话框组件

**任务**:
1. 引入四个对话框组件
2. 添加状态管理 (控制对话框开关)
3. 绑定按钮点击事件
4. 处理转账成功后的刷新逻辑

**代码示例**:
```typescript
const [transferAccountOpen, setTransferAccountOpen] = useState(false);
const [transferHubOpen, setTransferHubOpen] = useState(false);
const [depositOpen, setDepositOpen] = useState(false);
const [withdrawOpen, setWithdrawOpen] = useState(false);

const handleTransferSuccess = () => {
  // 刷新两个余额
  refetchAgentAccountBalances();
  refetchPaymentHubState();
  refetchPaymentHubRgas();
};
```

### Phase 5: 测试

#### Step 5.1: 功能测试

测试四种转账场景:
1. ✓ 账户余额转账到其他地址
2. ✓ Hub 余额转账到其他 Hub
3. ✓ 账户余额充值到 Hub
4. ✓ Hub 余额提现到账户

#### Step 5.2: 边界测试

1. 余额不足场景
2. 地址格式错误
3. 金额为 0
4. 金额超过最大值
5. 提现时锁定余额测试
6. 网络错误处理
7. 用户取消交易

#### Step 5.3: UI/UX 测试

1. 对话框打开/关闭流畅
2. 输入验证实时反馈
3. 错误提示清晰
4. 进度显示准确
5. 成功后余额正确刷新
6. Toast 提示及时

## 六、技术细节

### 6.1 合约函数参考

| 功能 | 合约模块 | 函数名 | 类型参数 | 参数 |
|------|---------|--------|---------|------|
| 账户转账 | `account_coin_store` | `transfer` | `CoinType` | `to: address, amount: u256` |
| Hub 转账 | `payment_channel` | `transfer_to_hub_entry` | `CoinType` | `receiver: address, amount: u256` |
| 充值 | `payment_channel` | `deposit_to_hub_entry` | `CoinType` | `receiver: address, amount: u256` |
| 提现 | `payment_channel` | `withdraw_from_hub_entry` | `CoinType` | `amount: u256` |

### 6.2 余额查询

```typescript
// Account Balance (通过 Rooch SDK)
const balances = await roochClient.getBalances({
  owner: address,
  cursor: null,
  limit: '100',
});

// Payment Hub Balance
const hubBalance = await paymentHubClient.getBalance({
  ownerDid: did,
  assetId: assetId,
});

// Unlocked Balance (可提现余额)
const unlockedBalance = await contract.getUnlockedBalance(ownerDid, assetId);

// Active Channels
const activeCounts = await contract.getActiveChannelsCounts(ownerDid);
```

### 6.3 DID 和地址转换

```typescript
// DID to Address
function didToAddress(did: string): string {
  // did:rooch:0x1234... -> 0x1234...
  return did.split(':')[2];
}

// Address to DID
function addressToDid(address: string): string {
  // 0x1234... -> did:rooch:0x1234...
  return `did:rooch:${address}`;
}
```

### 6.4 金额格式化

```typescript
// String to BigInt (with decimals)
function parseAmount(amount: string, decimals: number): bigint {
  const parts = amount.split('.');
  const integerPart = parts[0] || '0';
  const fractionalPart = (parts[1] || '').padEnd(decimals, '0').slice(0, decimals);
  return BigInt(integerPart + fractionalPart);
}

// BigInt to String (with decimals)
function formatAmount(amount: bigint, decimals: number): string {
  const amountStr = amount.toString().padStart(decimals + 1, '0');
  const integerPart = amountStr.slice(0, -decimals) || '0';
  const fractionalPart = amountStr.slice(-decimals);
  return `${integerPart}.${fractionalPart}`.replace(/\.?0+$/, '');
}
```

## 七、安全考虑

### 7.1 输入验证

- ✓ 严格验证地址格式
- ✓ 验证金额范围
- ✓ 防止负数和 0 值
- ✓ 防止超过余额的转账

### 7.2 交易确认

- ✓ 显示详细的交易信息供用户确认
- ✓ 明确显示发送方和接收方
- ✓ 显示金额和 gas 费用

### 7.3 错误处理

- ✓ 捕获所有可能的错误
- ✓ 提供清晰的错误提示
- ✓ 记录错误日志供调试

### 7.4 状态管理

- ✓ 防止重复提交
- ✓ 交易进行中禁用按钮
- ✓ 确保余额及时刷新

## 八、性能优化

### 8.1 余额缓存

使用 React Query 缓存余额数据:
- `staleTime`: 30 秒
- 转账成功后立即 invalidate

### 8.2 懒加载

对话框组件使用懒加载:
```typescript
const TransferAccountModal = lazy(() => 
  import('@/components/balance/TransferAccountModal')
);
```

### 8.3 防抖

金额输入使用防抖，减少验证次数:
```typescript
const debouncedAmount = useDebounce(amount, 300);
```

## 九、用户帮助文档

### 9.1 FAQ

**Q: 什么是账户余额？**
A: 账户余额是您的链上账户中的代币余额，可用于普通转账、支付 gas 费用等链上操作。

**Q: 什么是支付通道余额？**
A: 支付通道余额是专门用于支付通道的余额。支付通道允许快速、低成本的小额支付，无需每次都提交链上交易。

**Q: 为什么支付通道有锁定余额？**
A: 当您有活跃的支付通道时，系统会锁定部分余额作为保证金，确保通道的安全性。关闭通道后，锁定余额会被释放。

**Q: 如何提现被锁定的余额？**
A: 您需要先关闭相关的支付通道，然后锁定余额会自动释放，即可提现。

**Q: 转账需要多长时间？**
A: 账户转账和 Hub 操作通常在几秒内完成。具体时间取决于网络状况。

### 9.2 操作指南

见本文档第三章的各功能详细说明。

## 十、未来扩展

### 10.1 批量转账

支持一次转账到多个地址。

### 10.2 定时转账

设置定时转账任务。

### 10.3 转账记录

显示历史转账记录，包括:
- 时间
- 类型 (转账/充值/提现)
- 金额
- 对方地址
- 交易状态
- 交易 hash

### 10.4 地址簿

保存常用地址，方便快速选择。

### 10.5 二维码

- 生成收款二维码
- 扫码转账

## 十一、参考资料

### 11.1 相关文档

- [Rooch Framework Payment Channel 合约](../../deps/rooch/frameworks/rooch-framework/sources/payment_channel.move)
- [Payment Kit Documentation](../../nuwa-kit/typescript/packages/payment-kit/README.md)
- [DID Service](./wallet-auth-architecture.md)

### 11.2 相关代码

- Agent Detail Page: `src/pages/agent-detail.tsx`
- Payment Hub Client: `nuwa-kit/typescript/packages/payment-kit/src/client/PaymentHubClient.ts`
- Rooch Contract: `nuwa-kit/typescript/packages/payment-kit/src/rooch/RoochPaymentChannelContract.ts`

---

**文档维护者**: Development Team  
**最后更新**: 2025-12-09
