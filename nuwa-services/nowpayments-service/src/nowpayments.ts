import axios, { AxiosInstance } from 'axios';
import crypto from 'crypto';

export interface CreatePaymentRequest {
	price_amount: number;
	price_currency: string; // e.g. 'usd'
	order_id?: string;
	order_description?: string;
	pay_currency?: string; // e.g. 'btc', 'eth'
	ipn_callback_url?: string;
    case?: string;
}

export interface NowPaymentsClientOptions {
	apiKey: string;
	ipnSecret: string;
	baseUrl?: string; // default https://api.nowpayments.io/v1
}

export class NowPaymentsClient {
	private http: AxiosInstance;
	private apiKey: string;
	private ipnSecret: string;

	constructor(opts: NowPaymentsClientOptions) {
		this.apiKey = opts.apiKey;
		this.ipnSecret = opts.ipnSecret;
		this.http = axios.create({
			baseURL: opts.baseUrl || 'https://api.nowpayments.io/v1',
			headers: {
				'x-api-key': this.apiKey,
				'Content-Type': 'application/json',
			},
			timeout: 15000,
		});
	}

	// 创建支付
	async createPayment(body: CreatePaymentRequest): Promise<any> {
		const resp = await this.http.post('/payment', body);
        console.log(resp.data)
		return resp.data;
	}

	// 查询支付
	async getPayment(paymentId: string): Promise<any> {
		const resp = await this.http.get(`/payment/${encodeURIComponent(paymentId)}`);
		return resp.data;
	}

	// 获取可用加密货币
	async getCurrencies(): Promise<any> {
		const resp = await this.http.get('/full-currencies');
		return resp.data;
	}

	// 获取可用法币
	async getFiatCurrencies(): Promise<any> {
		const resp = await this.http.get('/fiat');
		return resp.data;
	}

	// 获取最小支付金额
	async getMinimumAmount(currencyFrom: string, currencyTo: string, fiat_equivalent: string, is_fixed_rate: string, is_fee_paid_by_user: string): Promise<any> {
		const resp = await this.http.get('/min-amount', {
			params: { currency_from: currencyFrom, currency_to: currencyTo, fiat_equivalent: fiat_equivalent, is_fixed_rate: is_fixed_rate, is_fee_paid_by_user: is_fee_paid_by_user },
		});
		return resp.data;
	}

	// 获取预估兑换金额（汇率）
	async estimatePrice(amount: number, currencyFrom: string, currencyTo: string): Promise<any> {
		const resp = await this.http.get('/estimate', {
			params: { amount, currency_from: currencyFrom, currency_to: currencyTo },
		});
		return resp.data;
	}

	// 验证 webhook
	verifyWebhook(rawBody: Buffer, signature: string): boolean {
		if (!this.ipnSecret) return false;
		const hmac = crypto.createHmac('sha512', this.ipnSecret);
		hmac.update(rawBody);
		const digest = hmac.digest('hex');
		return digest.toLowerCase() === signature.toLowerCase();
	}
}
