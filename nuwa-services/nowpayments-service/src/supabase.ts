import { createClient, SupabaseClient } from '@supabase/supabase-js';

export interface PaymentRecord {
	id?: string;
	nowpayments_payment_id: string;
	order_id?: string;
	amount_fiat: number;
	currency_fiat: string;
	status: string;
	pay_currency?: string;
	payer_did?: string;
	transfer_tx?: string | null;
	ipn_payload?: any;
	created_at?: string;
	updated_at?: string;
	// NowPayments 创建订单返回的完整信息
	pay_address?: string;
	price_amount?: number;
	price_currency?: string;
	pay_amount?: number;
	order_description?: string;
	ipn_callback_url?: string;
	purchase_id?: string;
	amount_received?: number | null;
	payin_extra_id?: string | null;
	smart_contract?: string;
	network?: string;
	network_precision?: number;
	time_limit?: number | null;
	burning_percent?: number | null;
	expiration_estimate_date?: string;
    transferred_amount?: number | string;
	transferred_tx_hash?: string;
	network_fee?: number;
}

export class SupabaseService {
	private client: SupabaseClient;
	private table: string;

	constructor() {
		const url = process.env.SUPABASE_URL || '';
		const key = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_ANON_KEY || '';
		this.table = process.env.SUPABASE_TABLE || 'nowpayments_payments';
		this.client = createClient(url, key);
	}

	async upsertPayment(rec: PaymentRecord): Promise<PaymentRecord | null> {
		const { data, error } = await this.client
			.from(this.table)
			.upsert(rec, { onConflict: 'nowpayments_payment_id' })
			.select()
			.single();
		if (error) throw error;
		return data as any;
	}

	async markTransferred(paymentId: string, txHash: string, amount?: number | bigint | string): Promise<void> {
		const updateData: any = { transfer_tx: txHash };
		if (amount !== undefined) {
			updateData.transferred_amount = typeof amount === 'bigint' ? amount.toString() : amount;
			updateData.transferred_tx_hash = txHash;
		}
		
		const { error } = await this.client
			.from(this.table)
			.update(updateData)
			.eq('nowpayments_payment_id', paymentId);
		if (error) throw error;
	}

	async updateTransferredAmount(paymentId: string, amount: number | bigint | string, txHash: string): Promise<void> {
		const normalizedAmount = typeof amount === 'bigint' ? amount.toString() : amount;
		const { error } = await this.client
			.from(this.table)
			.update({ 
				transferred_amount: normalizedAmount,
				transferred_tx_hash: txHash
			})
			.eq('nowpayments_payment_id', paymentId);
		if (error) throw error;
	}

	async updateNetworkFee(paymentId: string, networkFee: number): Promise<void> {
		const { error } = await this.client
			.from(this.table)
			.update({ network_fee: networkFee })
			.eq('nowpayments_payment_id', paymentId);
		if (error) throw error;
	}

	async addNetworkFee(paymentId: string, additionalNetworkFee: number): Promise<void> {
		// 先获取当前的网络费用
		const existing = await this.getByPaymentId(paymentId);
		const currentNetworkFee = existing?.network_fee || 0;
		const newNetworkFee = currentNetworkFee + additionalNetworkFee;
		
		const { error } = await this.client
			.from(this.table)
			.update({ network_fee: newNetworkFee })
			.eq('nowpayments_payment_id', paymentId);
		if (error) throw error;
	}

	async getByPaymentId(paymentId: string): Promise<PaymentRecord | null> {
		const { data, error } = await this.client
			.from(this.table)
			.select('*')
			.eq('nowpayments_payment_id', paymentId)
			.maybeSingle();
		if (error) throw error;
		return data as any;
	}

	async listByPayerDid(params: { did: string; status?: string[]; limit?: number; offset?: number }): Promise<PaymentRecord[]> {
		const { did, status, limit = 50, offset = 0 } = params;
		let query = this.client.from(this.table).select('*').eq('payer_did', did).order('created_at', { ascending: false });
		if (status && status.length > 0) {
			query = query.in('status', status);
		}
		const { data, error } = await query.range(offset, offset + limit - 1);
		if (error) throw error;
		return (data as any[]) || [];
	}
} 