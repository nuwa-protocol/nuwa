// 测试环境设置文件
import dotenv from 'dotenv';

// 加载测试环境变量
dotenv.config({ path: '.env.test' });

// 设置测试环境默认值
process.env.NODE_ENV = 'test';
process.env.PORT = process.env.PORT || '3001';
process.env.HOST = process.env.HOST || '127.0.0.1';

// 测试用的默认环境变量
if (!process.env.SERVICE_KEY) {
  process.env.SERVICE_KEY = 'test-service-key-for-testing-only';
}

if (!process.env.ROOCH_NODE_URL) {
  process.env.ROOCH_NODE_URL = 'http://localhost:6767';
}

if (!process.env.ROOCH_NETWORK) {
  process.env.ROOCH_NETWORK = 'test';
}

if (!process.env.DEFAULT_ASSET_ID) {
  process.env.DEFAULT_ASSET_ID = '0x3::gas_coin::RGas';
}

// 测试用的 API keys（用于 mock）
if (!process.env.OPENROUTER_API_KEY) {
  process.env.OPENROUTER_API_KEY = 'test-openrouter-key';
}

if (!process.env.OPENAI_API_KEY) {
  process.env.OPENAI_API_KEY = 'test-openai-key';
}

if (!process.env.LITELLM_BASE_URL) {
  process.env.LITELLM_BASE_URL = 'http://localhost:4000';
}

if (!process.env.LITELLM_API_KEY) {
  process.env.LITELLM_API_KEY = 'test-litellm-key';
}

// Supabase 测试配置
if (!process.env.SUPABASE_URL) {
  process.env.SUPABASE_URL = 'http://localhost:54321';
}

if (!process.env.SUPABASE_ANON_KEY) {
  process.env.SUPABASE_ANON_KEY = 'test-anon-key';
}

if (!process.env.API_KEY_ENCRYPTION_KEY) {
  process.env.API_KEY_ENCRYPTION_KEY = 'test-encryption-key-32-chars-long';
}

// 全局测试超时
jest.setTimeout(30000);

// 全局错误处理
process.on('unhandledRejection', (reason, promise) => {
  console.error('Unhandled Rejection at:', promise, 'reason:', reason);
});

// 清理函数
afterAll(async () => {
  // 清理测试后的资源
  await new Promise(resolve => setTimeout(resolve, 100));
});

console.log('Test environment setup completed');
