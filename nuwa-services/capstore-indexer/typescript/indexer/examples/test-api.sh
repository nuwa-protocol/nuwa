#!/bin/bash

# Capstore Indexer RESTful API 测试脚本
# 使用方法: ./examples/test-api.sh

BASE_URL="http://localhost:3000"

echo "=== Capstore Indexer RESTful API 测试 ==="
echo ""

# 测试健康检查
echo "1. 测试健康检查 (GET /health)"
curl -s "${BASE_URL}/health"
echo -e "\n"

# 测试搜索所有 Caps (分页)
echo "2. 测试搜索所有 Caps - 第一页 (GET /api/caps)"
curl -s "${BASE_URL}/api/caps?page=0&pageSize=10" | jq '.'
echo ""

# 测试按名称搜索
echo "3. 测试按名称搜索 (GET /api/caps?name=example)"
curl -s "${BASE_URL}/api/caps?name=example" | jq '.'
echo ""

# 测试按标签搜索
echo "4. 测试按标签搜索 (GET /api/caps?tags=ai&tags=chat)"
curl -s "${BASE_URL}/api/caps?tags=ai&tags=chat" | jq '.'
echo ""

# 测试排序
echo "5. 测试按评分排序 (GET /api/caps?sortBy=average_rating&sortOrder=desc)"
curl -s "${BASE_URL}/api/caps?sortBy=average_rating&sortOrder=desc&pageSize=5" | jq '.'
echo ""

# 注意：以下测试需要实际的 Cap ID
# 替换 YOUR_CAP_ID 为实际的 ID 进行测试
echo "6. 测试根据 ID 查询 Cap (需要替换实际 ID)"
echo "curl -s '${BASE_URL}/api/caps/YOUR_CAP_ID' | jq '.'"
echo ""

echo "7. 测试根据 CID 查询 Cap (需要替换实际 CID)"
echo "curl -s '${BASE_URL}/api/caps/cid/YOUR_CID' | jq '.'"
echo ""

echo "=== 测试完成 ==="

