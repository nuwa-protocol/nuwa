/**
 * Capstore Indexer RESTful API 测试脚本 (Node.js 版本)
 * 使用方法: node examples/test-api.js
 */

const BASE_URL = 'http://localhost:3000';

async function testAPI() {
  console.log('=== Capstore Indexer RESTful API 测试 ===\n');

  // 测试 1: 健康检查
  console.log('1. 测试健康检查 (GET /health)');
  try {
    const response = await fetch(`${BASE_URL}/health`);
    const text = await response.text();
    console.log(`   状态: ${response.status}`);
    console.log(`   响应: ${text}`);
  } catch (error) {
    console.error(`   错误: ${error.message}`);
  }
  console.log('');

  // 测试 2: 搜索所有 Caps
  console.log('2. 测试搜索所有 Caps - 第一页 (GET /api/caps)');
  try {
    const response = await fetch(`${BASE_URL}/api/caps?page=0&pageSize=10`);
    const data = await response.json();
    console.log(`   状态: ${response.status}`);
    console.log(`   总数: ${data.data?.totalItems || 'N/A'}`);
    console.log(`   返回记录数: ${data.data?.items?.length || 0}`);
    if (data.data?.items?.length > 0) {
      console.log(`   第一条记录: ${JSON.stringify(data.data.items[0], null, 2)}`);
    }
  } catch (error) {
    console.error(`   错误: ${error.message}`);
  }
  console.log('');

  // 测试 3: 按名称搜索
  console.log('3. 测试按名称搜索 (GET /api/caps?name=example)');
  try {
    const response = await fetch(`${BASE_URL}/api/caps?name=example`);
    const data = await response.json();
    console.log(`   状态: ${response.status}`);
    console.log(`   找到记录数: ${data.data?.totalItems || 0}`);
  } catch (error) {
    console.error(`   错误: ${error.message}`);
  }
  console.log('');

  // 测试 4: 按标签搜索
  console.log('4. 测试按标签搜索 (GET /api/caps?tags=ai&tags=chat)');
  try {
    const response = await fetch(`${BASE_URL}/api/caps?tags=ai&tags=chat`);
    const data = await response.json();
    console.log(`   状态: ${response.status}`);
    console.log(`   找到记录数: ${data.data?.totalItems || 0}`);
  } catch (error) {
    console.error(`   错误: ${error.message}`);
  }
  console.log('');

  // 测试 5: 按评分排序
  console.log('5. 测试按评分排序 (GET /api/caps?sortBy=average_rating&sortOrder=desc)');
  try {
    const response = await fetch(
      `${BASE_URL}/api/caps?sortBy=average_rating&sortOrder=desc&pageSize=5`
    );
    const data = await response.json();
    console.log(`   状态: ${response.status}`);
    console.log(`   返回记录数: ${data.data?.items?.length || 0}`);
    if (data.data?.items?.length > 0) {
      console.log(`   评分最高的 Cap: ${data.data.items[0].name || 'N/A'}`);
      console.log(`   平均评分: ${data.data.items[0].average_rating || 'N/A'}`);
    }
  } catch (error) {
    console.error(`   错误: ${error.message}`);
  }
  console.log('');

  // 测试 6: 根据 ID 查询 (示例)
  console.log('6. 测试根据 ID 查询 Cap (需要替换实际 ID)');
  console.log(`   示例: fetch('${BASE_URL}/api/caps/YOUR_CAP_ID')`);
  console.log('');

  // 测试 7: 根据 CID 查询 (示例)
  console.log('7. 测试根据 CID 查询 Cap (需要替换实际 CID)');
  console.log(`   示例: fetch('${BASE_URL}/api/caps/cid/YOUR_CID')`);
  console.log('');

  console.log('=== 测试完成 ===');
}

// 运行测试
testAPI().catch(console.error);

