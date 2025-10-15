module.exports = {
  // 使用标准 ts-jest 预设
  preset: 'ts-jest',
  
  // 设置测试环境为 Node.js
  testEnvironment: 'node',
  
  // 测试文件匹配模式
  testMatch: [
    '**/test/**/*.test.ts',
    '**/test/**/*.test.js'
  ],
  
  // 忽略的文件和目录
  testPathIgnorePatterns: [
    '/node_modules/',
    '/dist/',
  ],
  
  // 模块文件扩展名
  moduleFileExtensions: ['ts', 'tsx', 'js', 'jsx', 'json'],
  
  // 转换配置
  transform: {
    '^.+\\.tsx?$': 'ts-jest',
  },
  
  // TypeScript 配置
  globals: {
    'ts-jest': {
      tsconfig: 'tsconfig.test.json'
    }
  },
  
  // 模块名称映射，处理 .js 扩展名的导入
  moduleNameMapper: {
    '^(\\.{1,2}/.*)\\.js$': '$1',
  },
  
  // 覆盖率配置
  collectCoverageFrom: [
    'src/**/*.{ts,tsx}',
    '!src/**/*.d.ts',
    '!src/**/index.ts',
  ],
  
  // 覆盖率报告
  coverageReporters: ['text', 'lcov', 'html'],
  
  // 超时设置
  testTimeout: 30000,
  
  // 详细输出
  verbose: true,
  
  // 清除模拟
  clearMocks: true,
  
  // 强制退出
  forceExit: true,
};