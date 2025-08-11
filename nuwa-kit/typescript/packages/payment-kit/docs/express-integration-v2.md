# Express 集成 V2 - 自动前置/后置计费

> **状态**: 实验性功能 - Billing V2 的一部分
>
> 本文档介绍如何使用 Payment Kit V2 的自动前置/后置计费功能。

---

## 概述

Payment Kit V2 引入了自动前置/后置计费检测，根据策略类型自动决定何时计算费用：

- **前置计费**: 适用于固定价格策略（如 `PerRequest`），在请求执行前计算费用
- **后置计费**: 适用于依赖执行结果的策略（如 `PerToken`），在请求执行后计算费用

## 快速开始

### 1. 启用自动计费

```typescript
import { createExpressPaymentKit } from '@nuwa-ai/payment-kit/express';

const payment = await createExpressPaymentKit({
  serviceId: 'my-llm-service',
  signer: keyManager,
  useAutoBilling: true, // 启用 V2 自动计费
  debug: true,
});
```

### 2. 注册路由与策略

```typescript
// 前置计费：固定价格，请求前计算
payment.get('/health', { pricing: '0' }, (req, res) => {
  res.json({ status: 'ok' });
});

payment.post(
  '/upload',
  {
    pricing: '5000000000000', // 5 picoUSD per request
    paymentRequired: true,
  },
  (req, res) => {
    // 费用已在请求前计算并验证
    const result = processUpload(req.body);
    res.json({ result });
  }
);

// 后置计费：基于使用量，请求后计算
payment.post(
  '/chat',
  {
    strategy: {
      type: 'PerToken',
      unitPricePicoUSD: '2000000000', // 2 picoUSD per token
      usageKey: 'usage.total_tokens',
    },
    paymentRequired: true,
  },
  async (req, res) => {
    // 业务逻辑执行
    const chatResponse = await callLLM(req.body);

    // 重要：将使用量数据附加到 res.locals.usage
    // 这将触发后置计费
    res.locals.usage = {
      usage: {
        total_tokens: chatResponse.usage.total_tokens,
        prompt_tokens: chatResponse.usage.prompt_tokens,
        completion_tokens: chatResponse.usage.completion_tokens,
      },
    };

    res.json({
      response: chatResponse.response,
      usage: chatResponse.usage,
    });

    // 响应结束后，中间件会自动：
    // 1. 提取 res.locals.usage 数据
    // 2. 使用 PerToken 策略计算最终费用
    // 3. 生成并添加 SubRAV 提案到响应头
  }
);
```

## 策略配置

### 前置计费策略

```yaml
# config/billing.yaml
rules:
  - id: health-check
    when: { path: '/health' }
    strategy:
      type: PerRequest
      price: '0'

  - id: file-upload
    when: { path: '/upload', method: 'POST' }
    strategy:
      type: PerRequest
      price: '5000000000000' # 5 picoUSD
    paymentRequired: true
```

### 后置计费策略

```yaml
rules:
  - id: chat-completion
    when: { path: '/chat', method: 'POST' }
    strategy:
      type: PerToken
      unitPricePicoUSD: '2000000000' # 2 picoUSD per token
      usageKey: 'usage.total_tokens'
    paymentRequired: true

  - id: text-generation
    when: { pathRegex: '^/generate' }
    strategy:
      type: PerToken
      unitPricePicoUSD: '1500000000' # 1.5 picoUSD per token
      usageKey: 'usage.total_tokens'
    paymentRequired: true
```

## 业务处理器示例

### LLM 聊天处理器

```typescript
app.use('/api', payment.router);

// 使用 V2 自动计费的 LLM 聊天接口
payment.post(
  '/api/chat',
  {
    strategy: {
      type: 'PerToken',
      unitPricePicoUSD: '2000000000',
      usageKey: 'usage.total_tokens',
    },
    paymentRequired: true,
  },
  async (req, res) => {
    try {
      const { messages, model } = req.body;

      // 调用 LLM
      const response = await openai.chat.completions.create({
        model: model || 'gpt-3.5-turbo',
        messages,
      });

      // 关键：将使用量数据设置到 res.locals.usage
      // 这将在响应完成后触发后置计费
      res.locals.usage = {
        usage: {
          total_tokens: response.usage?.total_tokens || 0,
          prompt_tokens: response.usage?.prompt_tokens || 0,
          completion_tokens: response.usage?.completion_tokens || 0,
        },
        model: response.model,
      };

      res.json({
        id: response.id,
        choices: response.choices,
        usage: response.usage,
        model: response.model,
      });
    } catch (error) {
      console.error('Chat error:', error);
      res.status(500).json({ error: 'Chat failed' });
    }
  }
);
```

### 混合计费场景

```typescript
// 前置计费：文件上传基础费用
payment.post(
  '/api/analyze-document',
  {
    pricing: '10000000000000', // 10 picoUSD base fee
    paymentRequired: true,
  },
  async (req, res) => {
    // 基础费用已在请求前收取

    const document = req.body;
    const analysis = await analyzeDocument(document);

    // 如果使用了 LLM 进行分析，还可以有额外的基于 token 的费用
    // 但这需要通过另一个 PerToken 规则处理

    res.json({ analysis });
  }
);

// 后置计费：基于分析复杂度的额外费用
payment.post(
  '/api/deep-analyze',
  {
    strategy: {
      type: 'PerToken',
      unitPricePicoUSD: '5000000000',
      usageKey: 'analysis.complexity_score',
    },
    paymentRequired: true,
  },
  async (req, res) => {
    const document = req.body;
    const result = await performDeepAnalysis(document);

    // 设置基于复杂度的计费数据
    res.locals.usage = {
      analysis: {
        complexity_score: result.complexityScore,
      },
    };

    res.json(result);
  }
);
```

## 调试和监控

### 启用调试日志

```typescript
const payment = await createExpressPaymentKit({
  serviceId: 'my-service',
  signer: keyManager,
  useAutoBilling: true,
  debug: true, // 启用详细日志
});
```

调试日志示例：

```
🔍 Processing HTTP payment request with auto-detection: POST /chat
⏳ Post-flight billing detected - preparing payment session
🔄 Completing deferred billing with usage data: { usage: { total_tokens: 150 } }
✅ Deferred billing completed successfully
```

### 监控计费状态

```typescript
// 检查当前计费统计
app.get('/admin/billing-stats', (req, res) => {
  const stats = payment.getPayeeClient().getProcessingStats();
  res.json(stats);
});

// 检查自动索赔状态
app.get('/admin/claim-status', (req, res) => {
  const status = payment.getClaimStatus();
  res.json(status);
});
```

## 迁移指南

### 从 V1 迁移到 V2

1. **更新配置**：

   ```typescript
   // V1
   const payment = await createExpressPaymentKit({ ... });

   // V2
   const payment = await createExpressPaymentKit({
     ...,
     useAutoBilling: true
   });
   ```

2. **更新后置计费处理器**：

   ```typescript
   // V1: 手动管理前置/后置
   app.post('/chat', middleware.preCheck, async (req, res) => {
     const result = await callLLM(req.body);
     await middleware.postBill(req, res, result.usage);
     res.json(result);
   });

   // V2: 自动检测
   payment.post('/chat', { strategy: { type: 'PerToken', ... } }, async (req, res) => {
     const result = await callLLM(req.body);
     res.locals.usage = { usage: result.usage };  // 只需设置使用量
     res.json(result);
   });
   ```

3. **验证策略标记**：
   - `PerRequest`, `PerSize` 等 → 自动前置计费
   - `PerToken`, `PerChar` 等 → 自动后置计费

## 常见问题

**Q: 如何知道某个策略是前置还是后置？**

A: 检查策略的 `deferred` 属性或在日志中查看 "Pre-flight" 或 "Post-flight" 消息。

**Q: 后置计费时忘记设置 `res.locals.usage` 会怎样？**

A: 不会触发计费，但也不会产生错误。建议在开发时启用 `debug: true` 来监控。

**Q: 可以混合使用前置和后置计费吗？**

A: 可以，不同路由可以使用不同的策略。系统会自动为每个路由选择合适的计费模式。

**Q: 性能影响如何？**

A: 前置计费延迟更低，后置计费会有一次额外的异步处理，但通常在微秒级别。

---

> 版权所有 © Nuwa Network 2024
