import type {
  TransactionRecord,
  TransactionStore,
  TransactionStatus,
} from '../interfaces/TransactionStore';

export class MemoryTransactionStore implements TransactionStore {
  private records = new Map<string, TransactionRecord>();
  private order: string[] = [];
  private listeners = new Set<
    (e: { type: 'created' | 'updated'; record: TransactionRecord }) => void
  >();

  constructor(private readonly maxRecords: number = 500) {}

  async create(record: TransactionRecord): Promise<void> {
    this.records.set(record.clientTxRef, record);
    this.order.push(record.clientTxRef);
    this.trim();
    this.emit({ type: 'created', record });
  }

  async update(clientTxRef: string, updates: Partial<TransactionRecord>): Promise<void> {
    const existing = this.records.get(clientTxRef);
    if (!existing) return;
    const updated = { ...existing, ...updates } as TransactionRecord;
    this.records.set(clientTxRef, updated);
    this.emit({ type: 'updated', record: updated });
  }

  async get(clientTxRef: string): Promise<TransactionRecord | null> {
    return this.records.get(clientTxRef) || null;
  }

  async list(
    filter?: {
      status?: TransactionStatus;
      channelId?: string;
      protocol?: 'http' | 'mcp' | 'other';
      since?: number;
      until?: number;
    },
    pagination?: { offset?: number; limit?: number }
  ): Promise<{ items: TransactionRecord[]; total: number; hasMore: boolean }> {
    const offset = pagination?.offset ?? 0;
    const limit = pagination?.limit ?? 50;
    const items: TransactionRecord[] = [];
    for (let i = this.order.length - 1; i >= 0; i--) {
      const id = this.order[i];
      const rec = this.records.get(id);
      if (!rec) continue;
      if (filter?.status && rec.status !== filter.status) continue;
      if (filter?.channelId && rec.channelId !== filter.channelId) continue;
      if (filter?.protocol && rec.protocol !== filter.protocol) continue;
      if (typeof filter?.since === 'number' && rec.timestamp < filter.since) continue;
      if (typeof filter?.until === 'number' && rec.timestamp > filter.until) continue;
      items.push(rec);
      if (items.length >= offset + limit) break;
    }
    const window = items.slice(offset, offset + limit);
    const total = items.length;
    const hasMore = total > offset + window.length;
    return { items: window, total, hasMore };
  }

  async clear(): Promise<void> {
    this.records.clear();
    this.order = [];
  }

  subscribe(
    cb: (e: { type: 'created' | 'updated'; record: TransactionRecord }) => void
  ): () => void {
    this.listeners.add(cb);
    return () => this.listeners.delete(cb);
  }

  private trim(): void {
    while (this.order.length > this.maxRecords) {
      const oldest = this.order.shift();
      if (oldest) this.records.delete(oldest);
    }
  }

  private emit(e: { type: 'created' | 'updated'; record: TransactionRecord }): void {
    for (const l of this.listeners) {
      try {
        l(e);
      } catch {}
    }
  }
}
