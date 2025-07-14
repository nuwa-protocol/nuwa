# Payment Kit - 项目结构说明

## 📁 目录结构

```
payment-kit/
├── README.md                 # 项目介绍和使用说明
├── DESIGN.md                 # 详细设计文档
├── CHANGELOG.md              # 版本变更记录
├── package.json              # NPM 包配置
├── tsconfig.json             # TypeScript 配置
├── jest.config.json          # Jest 测试配置
├── .eslintrc.js              # ESLint 代码规范
├── .prettierrc               # Prettier 格式化规则
├──  __tests__/               # 测试文件目录
│   └── setup.js              # 测试环境设置
└── src/                      # 源代码目录
    ├── index.ts              # 主入口文件
    ├── core/                 # 核心协议实现（链无关）
    │   ├── types.ts          # 核心类型定义
    │   ├── subrav.ts         # SubRAV 编解码和签名
    │   └── http-header.ts    # HTTP Gateway Profile
    ├── rooch/                # Rooch 链特定实现
    │   ├── contract.ts       # Move 合约调用封装
    │   └── client.ts         # 高级客户端 API
    ├── utils/                # 工具函数
    │   └── index.ts          # 通用工具函数
    └── __tests__/            # 单元测试
        └── basic.test.ts     # 基础功能测试
```

## 📊 模块说明

### Core 模块 (`src/core/`)

**职责**: 实现与区块链无关的 NIP-4 协议核心逻辑

- **`types.ts`**: 定义所有核心数据结构（SubRAV、SignedSubRAV、ChannelMetadata 等）
- **`subrav.ts`**: SubRAV 的序列化/反序列化、签名/验证、数据验证
- **`http-header.ts`**: HTTP Gateway Profile 实现，处理 `X-Payment-Channel-Data` 头

### Rooch 模块 (`src/rooch/`)

**职责**: Rooch 区块链特定的实现

- **`contract.ts`**: 底层 Move 合约调用封装（目前为占位符实现）
- **`client.ts`**: 面向用户的高级 API，包含状态管理和缓存

### Utils 模块 (`src/utils/`)

**职责**: 通用工具函数

- BigInt 处理、随机数生成、十六进制验证、金额格式化等

## 🔧 开发状态

### ✅ 已完成

1. **项目结构**: 完整的 TypeScript 项目配置
2. **核心类型**: NIP-4 协议的完整类型定义
3. **SubRAV 处理**: 编解码、验证、序列化（使用临时 JSON 方案）
4. **HTTP 集成**: 完整的 HTTP Gateway Profile 实现
5. **工具函数**: 基础的数据处理和验证工具
6. **测试框架**: Jest 配置和基础测试用例

### 🚧 待实现

1. **BCS 序列化**: 当前使用 JSON，需要替换为真正的 BCS
2. **Rooch 集成**: Move 合约调用的实际实现
3. **Signer 转换**: SignerInterface 到 Rooch Signer 的转换
4. **DID 解析**: SubRAV 验证中的 DID 提取逻辑
5. **状态持久化**: 通道状态的持久化存储
6. **完整测试**: 端到端测试和集成测试

## 🎯 下一步开发计划

### M1 - 核心协议完善 (优先级: 高)
- [ ] 实现真正的 BCS 序列化支持
- [ ] 完善 SubRAV 验证中的 DID 解析逻辑
- [ ] 增加更多的单元测试和边界情况测试

### M2 - Rooch 集成 (优先级: 高)
- [ ] 等待 Payment Channel Move 合约完成
- [ ] 实现 RoochPaymentChannelContract 的真实调用
- [ ] 实现 SignerInterface 到 Rooch Signer 的转换
- [ ] 添加集成测试

### M3 - 高级功能 (优先级: 中)
- [ ] 实现状态持久化（IndexedDB/LocalStorage）
- [ ] 添加重连和错误恢复机制
- [ ] 实现通道关闭的完整流程
- [ ] 添加事件监听和状态同步

### M4 - 文档和示例 (优先级: 中)
- [ ] 创建详细的 API 文档
- [ ] 编写使用示例和教程
- [ ] 添加性能测试和基准测试

## 🔌 扩展点

### 多链支持
- 通过继承 `AbstractPaymentChannelContract` 可以轻松添加其他区块链支持
- 核心协议层保持不变，只需实现特定链的合约调用

### 缓存策略
- `ChannelStateCache` 接口支持可插拔的缓存实现
- 可以从内存缓存升级到 IndexedDB 或其他持久化方案

### 序列化格式
- `SubRAVCodec` 可以扩展支持不同的序列化格式
- 当前的 JSON 实现可以无缝替换为 BCS

## 📋 使用注意事项

1. **当前状态**: 这是一个架构完整但实现部分为占位符的版本
2. **依赖关系**: 需要 `@nuwa-ai/identity-kit` 进行签名和 DID 操作
3. **测试运行**: 由于依赖问题，当前测试可能无法直接运行，需要先解决 identity-kit 的依赖
4. **Move 合约**: Rooch 相关功能需要等待对应的 Move 合约开发完成

## 🚀 快速开始

```bash
# 安装依赖
cd nuwa-kit/typescript/packages/payment-kit
pnpm install

# 运行测试（当依赖就绪后）
pnpm test

# 构建项目
pnpm build

# 代码格式化
pnpm format

# 代码检查
pnpm lint
```

这个项目为 NIP-4 支付通道协议提供了完整的 TypeScript SDK 架构，并为未来的功能扩展和多链支持奠定了坚实的基础。 