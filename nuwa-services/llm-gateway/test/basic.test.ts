// 基础测试 - 验证 Jest 配置
describe('Basic Test', () => {
  test('should run a simple test', () => {
    expect(1 + 1).toBe(2);
  });

  test('should handle basic async operation', async () => {
    const result = await Promise.resolve('hello');
    expect(result).toBe('hello');
  });
});
