# RESTful API 快速入门

## 🎉 功能完成

Capstore Indexer 现在同时支持：
- ✅ MCP 协议: `http://localhost:3000/mcp`
- ✅ RESTful API: `http://localhost:3000/api`

## 🚀 快速开始

### 1. 构建项目

```bash
cd nuwa-services/capstore-indexer/typescript/indexer
npm run build
```

### 2. 启动服务

```bash
npm start
# 或开发模式
npm run dev
```

### 3. 测试 API

```bash
# 健康检查
curl http://localhost:3000/health

# 获取所有 Caps
curl http://localhost:3000/api/caps

# 搜索 Caps
curl "http://localhost:3000/api/caps?name=example&page=0&pageSize=10"

# 按评分排序
curl "http://localhost:3000/api/caps?sortBy=average_rating&sortOrder=desc"
```

## 📚 可用端点

| 方法 | 端点 | 描述 |
|------|------|------|
| GET | `/api/caps` | 搜索和列表查询 Caps |
| GET | `/api/caps/:id` | 根据 ID 查询 Cap |
| GET | `/api/caps/cid/:cid` | 根据 CID 查询 Cap |
| GET | `/api/caps/:id/stats` | 查询 Cap 统计信息 |
| GET | `/api/caps/download/:cid` | 下载 Cap 文件 |

## 🔍 查询参数

### GET /api/caps

- `name` - Cap 名称（可选）
- `tags` - 标签数组（可选，可多个）
- `page` - 页码，从 0 开始（默认: 0）
- `pageSize` - 每页数量（默认: 50）
- `sortBy` - 排序字段: `average_rating`, `downloads`, `favorites`, `rating_count`, `updated_at`
- `sortOrder` - 排序顺序: `asc`, `desc`（默认: desc）

## 💡 示例

### JavaScript/TypeScript

```typescript
// 查询所有 Caps
const response = await fetch('http://localhost:3000/api/caps?page=0&pageSize=20');
const data = await response.json();
console.log(data);

// 搜索 Caps
const searchResponse = await fetch(
  'http://localhost:3000/api/caps?name=example&tags=ai&sortBy=average_rating&sortOrder=desc'
);
const searchData = await searchResponse.json();
console.log(searchData);

// 查询特定 Cap
const capResponse = await fetch('http://localhost:3000/api/caps/YOUR_CAP_ID');
const capData = await capResponse.json();
console.log(capData);

// 查询 Cap 统计信息
const statsResponse = await fetch('http://localhost:3000/api/caps/YOUR_CAP_ID/stats');
const statsData = await statsResponse.json();
console.log(statsData);

// 下载 Cap 文件
const downloadResponse = await fetch('http://localhost:3000/api/caps/download/YOUR_CID?dataFormat=utf8');
const downloadData = await downloadResponse.json();
console.log(downloadData);
```

### Python

```python
import requests

# 查询所有 Caps
response = requests.get('http://localhost:3000/api/caps', params={
    'page': 0,
    'pageSize': 20,
    'sortBy': 'average_rating',
    'sortOrder': 'desc'
})
data = response.json()
print(data)

# 搜索 Caps
search_response = requests.get('http://localhost:3000/api/caps', params={
    'name': 'example',
    'tags': ['ai', 'chat']
})
search_data = search_response.json()
print(search_data)
```

## 📖 更多文档

- 完整 API 文档: [API.md](./API.md)
- 变更说明: [CHANGES.md](./CHANGES.md)
- 测试脚本: `examples/test-api.sh` 和 `examples/test-api.js`

## ⚠️ 注意事项

1. RESTful API 仅支持**只读操作**
2. 需要写操作（上传、评分等）仍需使用 MCP 协议
3. 无需身份验证即可访问只读接口
4. 所有响应均为 JSON 格式
5. 默认启用 CORS，允许跨域访问

