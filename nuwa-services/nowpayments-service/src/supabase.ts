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

	async markTransferred(paymentId: string, txHash: string): Promise<void> {
		const { error } = await this.client
			.from(this.table)
			.update({ transfer_tx: txHash })
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