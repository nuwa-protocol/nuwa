import express from 'express';
import { createExpressPaymentKit } from '../src/integrations/express/ExpressPaymentKit';
import type { PaymentChannelPayeeClient } from '../src/client/PaymentChannelPayeeClient';
import type { ContractRateProvider } from '../src/billing/rate/contract';

/**
 * Express Payment Kit 演示
 * 
 * 本示例展示了如何使用 ExpressPaymentKit 快速集成计费功能到 Express 应用中。
 * 
 * 相比传统方式需要手动组装 BillableRouter + HttpBillingMiddleware + UsdBillingEngine，
 * ExpressPaymentKit 提供了"一站式"的解决方案，只需要三行代码即可完成集成。
 */

async function createDemoServer() {
  // 注意：这只是一个演示文件，实际使用时需要提供真实的 PayeeClient
  // 在真实环境中，你需要：
  // 1. 创建有效的 DID 和密钥管理器
  // 2. 初始化 PaymentChannelPayeeClient
  // 3. 配置正确的 RPC URL 和合约地址
  
  console.log('🚀 ExpressPaymentKit 演示');
  console.log('📝 这是一个展示 API 使用方式的演示文件');
  console.log('⚠️  要运行真实的计费服务，请参考 test/e2e/server/index.ts');
  
  const app = express();
  app.use(express.json());

  // 模拟配置 - 实际使用时需要真实的客户端
  const mockSigner = {} as any; // 在真实环境中使用真实的 SignerInterface
  const mockRateProvider = {} as ContractRateProvider;

  try {
    // 🎯 步骤1: 创建 ExpressPaymentKit（一行代码）
    const payment = await createExpressPaymentKit({
      serviceId: 'llm-gateway-demo',
      signer: mockSigner,                     // 在真实环境中提供实际的 Signer
      defaultAssetId: '0x3::gas_coin::RGas',
      defaultPricePicoUSD: '500000000',       // 0.5 美分的兜底价格
      didAuth: false,                         // 演示环境关闭 DID 认证
      debug: true
    });

    // 🎯 步骤2: 声明路由与计价策略（一行代码）
    
    // 固定价格路由
    payment.get('/v1/echo', '1000000000', (req, res) => {
      res.json({
        echo: req.query.q || 'hello',
        message: '这是一个固定价格的接口 (1 美分)',
        timestamp: new Date().toISOString()
      });
    });

    // 按 Token 计价的路由（支持动态定价）
    payment.post('/v1/chat/completions', {
      type: 'PerToken',
      unitPricePicoUSD: '20000',            // 每个 token 0.00002 美元
      usageKey: 'usage.total_tokens'       // 从响应中提取使用量的路径
    }, (req, res) => {
      // 模拟 LLM API 响应
      const mockUsage = {
        prompt_tokens: 100,
        completion_tokens: 50,
        total_tokens: 150
      };

      // 🔑 关键：设置使用量到 res.locals，ExpressPaymentKit 会自动读取
      res.locals.usage = mockUsage;

      res.json({
        id: 'chatcmpl-demo',
        object: 'chat.completion',
        created: Math.floor(Date.now() / 1000),
        model: 'gpt-4',
        choices: [{
          index: 0,
          message: {
            role: 'assistant',
            content: `你说："${req.body.messages?.[0]?.content || 'Hello!'}"，我理解了。`
          },
          finish_reason: 'stop'
        }],
        usage: mockUsage
      });
    });

    // 批量处理路由
    payment.post('/v1/batch/process', '5000000000', (req, res) => {
      const items = req.body.items || [];
      res.json({
        processed: items.length,
        results: items.map((item: any, index: number) => ({
          id: index,
          input: item,
          output: `处理结果: ${JSON.stringify(item)}`
        })),
        message: '批量处理完成 (5 美分固定价格)'
      });
    });

    // 🎯 步骤3: 挂载到应用（一行代码）
    app.use('/api/v1', payment.router);

    // 额外功能：挂载管理和恢复路由
    app.use('/admin/billing', payment.adminRouter());    // 管理接口
    app.use('/payment', payment.recoveryRouter());       // 客户端数据恢复

    // 健康检查（不会被计费）
    app.get('/health', (req, res) => {
      res.json({ 
        status: 'ok', 
        message: 'ExpressPaymentKit 演示服务运行中',
        timestamp: new Date().toISOString() 
      });
    });

    console.log('\n✅ ExpressPaymentKit 配置完成！');
    console.log('\n📊 已配置的计费路由：');
    console.log('   GET  /api/v1/v1/echo                 - 固定价格 (1美分)');
    console.log('   POST /api/v1/v1/chat/completions     - 按Token计价 (0.00002$/token)');
    console.log('   POST /api/v1/v1/batch/process        - 固定价格 (5美分)');
    console.log('\n🔧 管理接口：');
    console.log('   GET  /admin/billing/claims           - 查看计费状态');
    console.log('   POST /admin/billing/claim/:channelId - 手动触发结算');
    console.log('\n🔄 恢复接口：');
    console.log('   GET  /payment/pending                - 获取待签名SubRAV');
    console.log('   GET  /payment/price/:assetId         - 查询资产价格');
    console.log('\n💡 使用提示：');
    console.log('   1. 客户端需要在请求头中提供 X-Payment-Channel-Data');
    console.log('   2. PerToken 策略会自动从 res.locals.usage 提取使用量');
    console.log('   3. 所有计费逻辑已自动处理，业务代码只需关注功能实现');

    return app;

  } catch (error) {
    console.error('❌ ExpressPaymentKit 初始化失败:', error);
    throw error;
  }
}

// 如果直接运行此文件，启动演示服务器
if (require.main === module) {
  createDemoServer()
    .then(app => {
      const port = process.env.PORT || 3000;
      app.listen(port, () => {
        console.log(`\n🚀 ExpressPaymentKit 演示服务器启动成功！`);
        console.log(`📍 访问地址: http://localhost:${port}`);
        console.log(`🏥 健康检查: http://localhost:${port}/health`);
        console.log('\n⚠️  注意：这只是API演示，要测试实际计费功能请使用 test/e2e/server/');
      });
    })
    .catch(error => {
      console.error('💥 服务器启动失败:', error);
      process.exit(1);
    });
}

export { createDemoServer }; 