# NOWPayments Service

一个基于 Express + TypeScript 的 NOWPayments 集成服务，支持创建支付、查询支付与 IPN Webhook 验证，并在支付完成后通过 Hub 向用户转账 RGAS（参考 `discord-interactions`）。

## 开发与运行

- 安装依赖：

```bash
pnpm -C nuwa-services/nowpayments-service install
```

- 启动开发：

```bash
pnpm -C nuwa-services/nowpayments-service dev
```

- 构建与启动：

```bash
pnpm -C nuwa-services/nowpayments-service build
pnpm -C nuwa-services/nowpayments-service start
```

## 环境变量

- 基础服务
  - `PORT`：服务端口，默认 8787
  - `NOWPAYMENTS_API_KEY`：NOWPayments API Key
  - `NOWPAYMENTS_IPN_SECRET`：IPN Webhook HMAC-SHA512 密钥
  - `NOWPAYMENTS_BASE_URL`：可选，默认 `https://api.nowpayments.io`

- Supabase 持久化
  - `SUPABASE_URL`：Supabase 项目 URL
  - `SUPABASE_SERVICE_ROLE_KEY`（推荐）或 `SUPABASE_ANON_KEY`
  - `SUPABASE_TABLE`：表名，默认 `nowpayments_payments`

- Rooch/Hub 转账（参考 `discord-interactions`）
  - `HUB_PRIVATE_KEY`：Hub 钱包私钥（用于从 Hub 账户转账）
  - `HUB_DID`：Hub DID，如 `did:rooch:0x...`
  - `ROOCH_RPC_URL`：Rooch RPC URL（默认 `https://test-seed.rooch.network`）
  - `RGAS_PER_USD`：USD 与 RGAS 的换算，默认 `100000000`（1 USD -> 1e8 RGAS），按需调整

## 数据表结构（Supabase / Postgres）

```sql
create table if not exists public.nowpayments_payments (
  id uuid primary key default gen_random_uuid(),
  nowpayments_payment_id text unique not null,
  order_id text,
  amount_fiat numeric not null,
  currency_fiat text not null,
  status text not null,
  pay_currency text,
  payer_did text,
  transfer_tx text,
  ipn_payload jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists idx_nowpayments_payments_payment_id
  on public.nowpayments_payments(nowpayments_payment_id);

create trigger set_timestamp
before update on public.nowpayments_payments
for each row execute procedure trigger_set_timestamp();
```

> 注：如数据库没有 `trigger_set_timestamp()`，可改为在应用层控制 `updated_at`，或创建等价触发器函数。

## API

- POST `/api/payments`
  - Body：
    - `price_amount` (number)
    - `price_currency` (string, e.g. `usd`)
    - `order_id` (string, optional)
    - `order_description` (string, optional)
    - `pay_currency` (string, optional, e.g. `btc`)
    - `ipn_callback_url` (string, optional)
    - `success_url` (string, optional)
    - `cancel_url` (string, optional)
    - `payer_did` (string, optional) 用户 DID，用于支付完成后转账 RGAS
  - 响应：NOWPayments `payment` 对象；同时在 Supabase upsert 一条记录

- GET `/api/payments/:id`
  - 路径参数：`id` NOWPayments payment id
  - 响应：`payment` 对象

- GET `/api/users/:did/orders`
  - 查询参数：
    - `status`（可选）：逗号分隔多个状态，如 `created,finished`
    - `limit`（可选，默认 50，最大 200）
    - `offset`（可选，默认 0）
  - 响应：`{ items: PaymentRecord[], limit, offset, count }`

- POST `/webhook/nowpayments`
  - Header：`x-nowpayments-sig`
  - Body：原始 JSON（用于 HMAC 校验）
  - 行为：
    1. 使用 `express.raw({ type: 'application/json' })` 解析原始体并校验 HMAC，避免被全局 `express.json()` 消费
    2. upsert IPN payload 到 Supabase
    3. 当 `payment_status` 处于完成态（如 `finished/confirmed/completed`），且记录中有 `payer_did` 且尚未 `transfer_tx`，按 `RGAS_PER_USD` 汇率从 Hub 给用户 DID 转账 RGAS，并记录 `transfer_tx`

## 注意

- Webhook 使用原始请求体进行 HMAC 校验，路由级中间件采用 `express.raw`，其他路由仍然使用 `express.json()`。
- 转账实现使用 `@nuwa-ai/payment-kit` 的 `PaymentHubClient.deposit`，与 `nuwa-services/discord-interactions` 逻辑一致。
- 生产环境请为 Webhook 加入幂等防护（本实现通过 `transfer_tx` 字段避免重复转账），并结合订单系统做更加严格的状态机控制。 