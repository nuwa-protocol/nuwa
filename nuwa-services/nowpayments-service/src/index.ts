import express, { Request, Response } from 'express';
import cors from 'cors';
import dotenv from 'dotenv';
import { NowPaymentsClient } from './nowpayments.js';
import { SupabaseService } from './supabase.js';
import { transferFromHubToUser } from './transfer.js';
import { z } from "zod";

dotenv.config();

const app = express();
const client = new NowPaymentsClient({
  apiKey: process.env.NOWPAYMENTS_API_KEY || '',
  ipnSecret: process.env.NOWPAYMENTS_IPN_SECRET || '',
  baseUrl: process.env.BASE_URL || '',
});
const supabase = new SupabaseService();

// CORS 配置
app.use(cors({
  origin: process.env.CORS_ORIGIN || '*', // 允许的源，默认允许所有
  methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization', 'x-nowpayments-sig'],
  credentials: true
}));

// Webhook 中间件 - 处理原始请求体
const webhookMiddleware = express.raw({ type: 'application/json' });

// Webhook 入口 (必须在 express.json() 之前定义)
app.post(
  '/webhook/nowpayments',
  webhookMiddleware,
  async (req: Request, res: Response) => {
    try {
      // 确保 body 是 Buffer 类型
      let bodyBuf: Buffer;
      if (Buffer.isBuffer(req.body)) {
        bodyBuf = req.body as Buffer;
      } else if (typeof req.body === 'string') {
        bodyBuf = Buffer.from(req.body, 'utf8');
      } else if (req.body && typeof req.body === 'object') {
        // 如果 body 是对象，说明 express.json() 已经解析过了，需要重新序列化
        bodyBuf = Buffer.from(JSON.stringify(req.body), 'utf8');
      } else {
        bodyBuf = Buffer.from('');
      }
      
      // 验证签名
      const signature = req.headers['x-nowpayments-sig'];
      if (!signature || Array.isArray(signature)) {
        console.error('Missing signature in webhook request');
        return res.status(400).json({ error: 'missing signature' });
      }
      
      const ok = client.verifyWebhook(bodyBuf, (signature as string).trim());
      if (!ok) {
        console.error('Invalid signature in webhook request');
        return res.status(403).json({ error: 'invalid signature' });
      }

      // 解析 payload
      let payload: any;
      try {
        payload = JSON.parse(bodyBuf.toString('utf8'));
      } catch (parseError) {
        console.error('Failed to parse webhook payload:', parseError);
        return res.status(400).json({ error: 'invalid json payload' });
      }

      const paymentId: string = payload.payment_id?.toString?.() || payload.id?.toString?.() || '';
      const status: string = payload.payment_status || payload.status || '';
      const price_amount: number = Number(payload.price_amount || 0);
      const price_currency: string = payload.price_currency || 'usd';
      const pay_currency: string | undefined = payload.pay_currency;

      if (!paymentId) {
        console.error('Missing payment_id in webhook payload');
        return res.status(400).json({ error: 'missing payment_id' });
      }

      console.log(`Processing webhook for payment ${paymentId} with status ${status}`);

      // 获取现有记录
      const existing = await supabase.getByPaymentId(paymentId);
      
      // 更新支付记录
      await supabase.upsertPayment({
        nowpayments_payment_id: paymentId,
        order_id: existing?.order_id,
        amount_fiat: existing?.amount_fiat ?? price_amount,
        currency_fiat: existing?.currency_fiat ?? price_currency,
        status,
        pay_currency: existing?.pay_currency ?? pay_currency,
        payer_did: existing?.payer_did,
        ipn_payload: payload,
        pay_address: payload.pay_address ?? existing?.pay_address,
        price_amount: payload.price_amount ?? existing?.price_amount,
        price_currency: payload.price_currency ?? existing?.price_currency,
        pay_amount: payload.pay_amount ?? existing?.pay_amount,
        order_description: payload.order_description ?? existing?.order_description,
        ipn_callback_url: payload.ipn_callback_url ?? existing?.ipn_callback_url,
        purchase_id: payload.purchase_id ?? existing?.purchase_id,
        amount_received: payload.amount_received ?? existing?.amount_received,
        payin_extra_id: payload.payin_extra_id ?? existing?.payin_extra_id,
        smart_contract: payload.smart_contract ?? existing?.smart_contract,
        network: payload.network ?? existing?.network,
        network_precision: payload.network_precision ?? existing?.network_precision,
        time_limit: payload.time_limit ?? existing?.time_limit,
        burning_percent: payload.burning_percent ?? existing?.burning_percent,
        expiration_estimate_date: payload.expiration_estimate_date ?? existing?.expiration_estimate_date,
      });

      // 处理支付成功的情况
      const isSuccess = ['finished', 'confirmed', 'completed'].includes(status.toLowerCase());
      if (isSuccess && existing && !existing.transfer_tx && existing.payer_did) {
        console.log(`Payment ${paymentId} completed, transferring RGAS to ${existing.payer_did}`);
        const rgasPerUsd = BigInt(process.env.RGAS_PER_USD || '100000000');
        const amountRgas = BigInt(Math.round(existing.amount_fiat)) * rgasPerUsd;
        
        try {
          const tx = await transferFromHubToUser(existing.payer_did, amountRgas);
          if (tx) {
            await supabase.markTransferred(paymentId, tx);
            console.log(`Transfer completed for payment ${paymentId}, tx: ${tx}`);
          } else {
            console.error(`Transfer failed for payment ${paymentId}`);
          }
        } catch (transferError) {
          console.error(`Transfer error for payment ${paymentId}:`, transferError);
        }
      }

      const isExpired = status.toLowerCase() === 'expired';
      const isPartiallyPaid = existing?.status?.toLowerCase() === 'partially_paid';
      
      if (isExpired && isPartiallyPaid && existing && existing.payer_did && !existing.transfer_tx) {
        console.log(`Payment ${paymentId} expired with partially_paid status, transferring RGAS for received amount`);
        
          try {
            const amountReceived = payload.actually_paid_at_fiat || 0;
            const originalAmount = existing.amount_fiat;
          
          console.log(`Handling expired partially paid order ${paymentId} for user ${existing.payer_did}`);
          console.log(`Order details: original_amount=${originalAmount}, received_amount=${amountReceived}, currency=${existing.currency_fiat}`);
          
          if (amountReceived > 0) {
            const rgasPerUsd = BigInt(process.env.RGAS_PER_USD || '100000000');
            const amountRgas = BigInt(Math.round(amountReceived)) * rgasPerUsd;
            
            console.log(`Transferring ${amountRgas.toString()} RGAS for received amount ${amountReceived} USD`);
            
            const tx = await transferFromHubToUser(existing.payer_did, amountRgas);
            if (tx) {
              await supabase.markTransferred(paymentId, tx);
              console.log(`Partial transfer completed for payment ${paymentId}, tx: ${tx}, amount: ${amountReceived} USD -> ${amountRgas.toString()} RGAS`);
            } else {
              console.error(`Partial transfer failed for payment ${paymentId}`);
            }
          } else {
            console.log(`No amount received for payment ${paymentId}, skipping transfer`);
          }
          
        } catch (expiredError) {
          console.error(`Error handling expired partially paid order ${paymentId}:`, expiredError);
        }
      }

      res.json({ ok: true });
    } catch (err: any) {
      console.error('Webhook processing error:', err);
      res.status(500).json({ error: err.response?.data || 'webhook processing error' });
    }
  }
);

// API 默认 json (webhook 路由除外)
app.use(express.json());

// 健康检查
app.get('/auth', (_req, res) => res.json({ ok: true }));


export const createPaymentRequestSchema = z.object({
  price_amount: z.number().positive(),
  price_currency: z.string().min(1),
  order_id: z.string().optional(),
  order_description: z.string().optional(),
  pay_currency: z.string().optional(),
  ipn_callback_url: z.string().url().optional(),
  payer_did: z.string(),
  cases: z.string().optional(),
});


// 创建支付
app.post('/api/payment', async (req: Request, res: Response) => {
  try {
    const parsed = createPaymentRequestSchema.safeParse(req.body);

    if (!parsed.success) {
      return res.status(400).json({
        error: "Invalid request body",
        details: parsed.error.format(),
      });
    }
    const {
      price_amount,
      price_currency,
      order_id,
      order_description,
      pay_currency,
      ipn_callback_url,
      payer_did,
      cases
    } = parsed.data;

    const payment = await client.createPayment({
      price_amount,
      price_currency,
      order_id,
      order_description,
      pay_currency,
      ipn_callback_url,
      case:cases ?? "success",
    });
      console.log(payment)
      console.log(payment.network)
    await supabase.upsertPayment({
      nowpayments_payment_id: payment.payment_id?.toString?.() || payment.id?.toString?.() || '',
      order_id,
      amount_fiat: price_amount,
      currency_fiat: price_currency,
      status: payment.payment_status || 'created',
      pay_currency,
      payer_did,
      ipn_payload: null,
      // 存储 NowPayments 返回的完整信息
      pay_address: payment.pay_address,
      price_amount: payment.price_amount,
      price_currency: payment.price_currency,
      pay_amount: payment.pay_amount,
      order_description: payment.order_description,
      ipn_callback_url: payment.ipn_callback_url,
      purchase_id: payment.purchase_id,
      amount_received: payment.amount_received,
      payin_extra_id: payment.payin_extra_id,
      smart_contract: payment.smart_contract,
      network: payment.network,
      network_precision: payment.network_precision,
      time_limit: payment.time_limit,
      burning_percent: payment.burning_percent,
      expiration_estimate_date: payment.expiration_estimate_date,
    });

    res.status(201).json(payment);
  } catch (err: any) {
      console.log(err.response.data)
    res.status(500).json({ error: err.response?.data || 'create payment failed' });
  }
});

// 查询支付
app.get('/api/payments/:id', async (req: Request, res: Response) => {
  try {
    const payment = await client.getPayment(req.params.id);
    res.json(payment);
  } catch (err: any) {
    res.status(500).json({ error: err.response?.data || 'get payment failed' });
  }
});


app.get('/api/payments/:id', async (req: Request, res: Response) => {
  try {
    const payment = await client.getPayment(req.params.id);
    res.json(payment);
  } catch (err: any) {
    res.status(500).json({ error: err.response?.data || 'get payment failed' });
  }
});


app.get('/api/payments-info/:id', async (req: Request, res: Response) => {
  try {
    const paymentId = req.params.id;

    const [dbRecord, npRecord] = await Promise.all([
      supabase.getByPaymentId(paymentId),
      client.getPayment(paymentId),
    ]);

    res.json({
      db: dbRecord,
      nowpayments: npRecord,
    });
  } catch (err: any) {
    console.error(err);
    res.status(500).json({ error: err.response?.data || "get payment failed" });
  }
});


// 用户订单列表
app.get('/api/users/:did/orders', async (req: Request, res: Response) => {
  try {
    const did = req.params.did;
    const statusParam = (req.query.status as string | undefined) || '';
    const status = statusParam.split(',').map(s => s.trim()).filter(Boolean);
    const limit = Math.min(Math.max(parseInt((req.query.limit as string) || '50', 10), 1), 200);
    const offset = Math.max(parseInt((req.query.offset as string) || '0', 10), 0);

    const records = await supabase.listByPayerDid({
      did,
      status: status.length ? status : undefined,
      limit,
      offset,
    });
    res.json({ items: records, limit, offset, count: records.length });
  } catch (err: any) {
    res.status(500).json({ error: err.response?.data || 'list orders failed' });
  }
});

// 获取可用币种
app.get('/api/full-currencies', async (req: Request, res: Response) => {
  try {
    const result = await client.getCurrencies();
    res.json(result);
  } catch (err: any) {
    res.status(500).json({ error: err.response?.data || 'get currencies failed' });
  }
});

// 获取可用法币
app.get('/api/fiat-currencies', async (_req: Request, res: Response) => {
  try {
    const result = await client.getFiatCurrencies();
    res.json(result);
  } catch (err: any) {
    res.status(500).json({ error: err.response?.data || 'get fiat currencies failed' });
  }
});

// 获取最低支付金额
app.get('/api/min-amount', async (req: Request, res: Response) => {
  try {
    const { from, to, fiat_equivalent, is_fixed_rate, is_fee_paid_by_user } = req.query;
    if (!from || !to) {
      return res.status(400).json({ error: 'missing currency_from or currency_to' });
    }
    const result = await client.getMinimumAmount(from as string, to as string, fiat_equivalent as string, is_fixed_rate as string, is_fee_paid_by_user as string);
    res.json(result);
  } catch (err: any) {
      console.log(err, req)
    res.status(500).json({ error: err.response?.data || 'get min-amount failed' });
  }
});

// 获取预估兑换金额（汇率）
app.get('/api/estimate', async (req: Request, res: Response) => {
  try {
    const { amount, from, to } = req.query;
    if (!amount || !from || !to) {
      return res.status(400).json({ error: 'missing amount, currency_from or currency_to' });
    }
    const result = await client.estimatePrice(
      Number(amount), 
      from as string, 
      to as string
    );
    res.json(result);
      console.log(result)
  } catch (err: any) {
      console.log(err)
    res.status(500).json({ error: err.response?.data || 'get estimate failed' });
  }
});


const PORT = process.env.PORT ? Number(process.env.PORT) : 8787;
app.listen(PORT, () => {
  console.log(`[nowpayments] service listening on :${PORT}`);
});
