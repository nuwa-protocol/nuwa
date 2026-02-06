# DIDAuth + curl 极简示例

在没有额外依赖的前提下，用 Node 内置 `crypto` + `curl` 完成一次 DIDAuth 请求，并给 Agent 使用的完整步骤。

## 先决条件
- Node.js ≥ 18（示例在 25.2.1 验证）
- 能在本机监听 127.0.0.1:3000（如被占用可改端口）

## 文件说明
- `generate-keys.js`：生成 Ed25519 私钥/公钥（PEM）
- `didauth.js`：纯 Node 内置 `crypto` 生成 `Authorization: DIDAuthV1 ...` 头（无依赖，便于复制到外部环境）
- `server.js`：示例验证服务（仍使用 identity-kit 验证逻辑，便于演示服务端最佳实践）；校验 audience/method/path/body_hash + nonce 防重放

## 快速跑通
```bash
cd examples/didauth-curl

# 1) 生成密钥（写出 agent-key.pem / agent-pub.pem）
node generate-keys.js

# 2) 启动验证服务（允许 did:example:agent1）
node server.js &
SERVER_PID=$!
sleep 1

# 3) 客户端生成 DIDAuth 头并用 curl 访问
BODY='{"hello":"world"}'
AUTH=$(node didauth.js --did did:example:agent1 --key agent-key.pem \
  --aud http://127.0.0.1:3000 --method POST --path /api --body "$BODY")
curl -X POST http://127.0.0.1:3000/api -H "Authorization: $AUTH" \
  -H 'Content-Type: application/json' --data "$BODY"

# 4) 结束服务
kill $SERVER_PID
```

预期返回：
```json
{"ok":true,"from":{"signer_did":"did:example:agent1","key_id":"did:example:agent1#key-1"}}
```

## 给 Agent 的最简指令（可直接嵌入 skill）
1. 运行 `node generate-keys.js` 生成密钥。  
2. 将 **公钥**（`agent-pub.pem`）给用户，让用户在 id.nuwa.dev 将该公钥添加为自己 DID 的 `authentication` key（Rooch testnet）。  
3. 用户把自己的 DID 文本发送给 Agent。  
4. Agent 解析 DID 文档，确认 `verificationMethod.id`/`authentication` 里包含自己提供的 `key_id`（默认 `did:<user_did>#key-1`，或你生成时的 fragment）。  
5. 发送请求：
   ```bash
   AUTH=$(node didauth.js --did <USER_DID> --key agent-key.pem \
     --aud <SERVICE_BASE_URL> --method <HTTP_METHOD> --path <PATH> --body '<RAW_BODY>')
   curl -X <HTTP_METHOD> <SERVICE_BASE_URL><PATH> -H "Authorization: $AUTH" -H 'Content-Type: application/json' --data '<RAW_BODY>'
   ```
6. 服务端按 `server.js` 的逻辑校验时间戳/nonce/audience/method/path/bodyHash/签名。

## 安全提示
- 私钥永不出机；泄漏时只需在 DID 文档撤销/替换对应 `verificationMethod` 即可失效。
- `audience`、`nonce`、`ts`、`bodyHash` 避免重放和篡改；窗口默认 ±300 秒，可按需调整。
- 如果需要绑定到 id.nuwa.dev，可把公钥（multibase 或 SPKI b64）封装进链接交给人类确认后写入 DID 文档，签名流程无需改动。
