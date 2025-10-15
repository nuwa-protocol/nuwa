# 测试指南

本文档描述如何运行 LLM Gateway 的测试用例。

## 快速开始

### 1. 安装依赖

```bash
pnpm install
```

### 2. 配置测试环境

复制测试环境配置文件：

```bash
cp test/env.example .env.test
```

根据需要修改 `.env.test` 文件中的配置。

### 3. 运行测试

```bash
# 运行所有测试
pnpm test

# 监视模式（文件更改时自动重新运行）
pnpm test:watch

# 运行测试并生成覆盖率报告
pnpm test:coverage
```

## 测试命令

| 命令 | 描述 |
|------|------|
| `pnpm test` | 运行所有测试用例 |
| `pnpm test:watch` | 监视模式，文件更改时自动重新运行测试 |
| `pnpm test:coverage` | 运行测试并生成代码覆盖率报告 |

## 测试结构

```
test/
├── setup.ts                 # 测试环境设置
├── env.example              # 测试环境变量示例
├── pricing.test.ts          # 定价系统测试
├── dynamic-routes.test.ts   # 动态路由测试
├── integration.test.ts      # 集成测试
├── registry-api-key.test.ts # API Key 注册测试
└── pricing-config.test.js   # 定价配置测试
```

## 测试环境变量

测试时会自动加载 `.env.test` 文件中的环境变量。主要配置包括：

- `SERVICE_KEY`: 测试用服务密钥
- `ROOCH_NODE_URL`: Rooch 节点 URL
- `OPENROUTER_API_KEY`: OpenRouter API Key（测试用）
- `OPENAI_API_KEY`: OpenAI API Key（测试用）
- `LITELLM_API_KEY`: LiteLLM API Key（测试用）
- `SUPABASE_URL`: Supabase URL（测试用）

## 覆盖率报告

运行 `pnpm test:coverage` 后，覆盖率报告会生成在：

- `coverage/lcov-report/index.html` - HTML 格式的详细报告
- `coverage/lcov.info` - LCOV 格式报告
- 终端输出 - 文本格式摘要

## 测试最佳实践

1. **隔离性**: 每个测试用例应该独立运行，不依赖其他测试的状态
2. **清理**: 测试后应清理创建的资源和状态
3. **模拟**: 使用 mock 来模拟外部服务和依赖
4. **断言**: 使用明确的断言来验证预期行为
5. **描述性**: 测试名称应清楚描述测试的内容

## 调试测试

如果测试失败，可以：

1. 检查测试输出中的错误信息
2. 使用 `--verbose` 标志获取更详细的输出
3. 在测试中添加 `console.log` 进行调试
4. 使用 VS Code 的 Jest 扩展进行断点调试

## 常见问题

### 环境变量问题

如果测试因环境变量问题失败：

1. 确认 `.env.test` 文件存在且配置正确
2. 检查 `test/setup.ts` 中的默认值设置
3. 确保所有必需的环境变量都已设置

### 依赖问题

如果出现模块导入错误：

1. 确认所有依赖都已安装：`pnpm install`
2. 检查 `jest.config.js` 中的模块映射配置
3. 确认 TypeScript 配置正确

### 超时问题

如果测试超时：

1. 检查 `jest.config.js` 中的 `testTimeout` 设置
2. 确认异步操作正确处理
3. 检查是否有未完成的 Promise 或定时器

## 持续集成

在 CI/CD 环境中运行测试时：

1. 确保安装了所有依赖
2. 设置适当的环境变量
3. 使用 `pnpm test:coverage` 生成覆盖率报告
4. 配置覆盖率阈值检查
