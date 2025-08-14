import type {
  TransactionRecord,
  TransactionStatus,
  TransactionStore,
} from '../interfaces/TransactionStore';

/**
 * IndexedDB-based TransactionStore
 */
export class IndexedDBTransactionStore implements TransactionStore {
  private dbName = 'nuwa-payment-kit-transactions';
  private version = 1;

  private async getDB(): Promise<IDBDatabase> {
    return new Promise((resolve, reject) => {
      const request = indexedDB.open(this.dbName, this.version);

      request.onerror = () => reject(request.error);
      request.onsuccess = () => resolve(request.result);

      request.onupgradeneeded = event => {
        const db = (event.target as IDBOpenDBRequest).result;
        if (!db.objectStoreNames.contains('transactions')) {
          const store = db.createObjectStore('transactions', { keyPath: 'clientTxRef' });
          store.createIndex('timestamp', 'timestamp', { unique: false });
          store.createIndex('channelId', 'channelId', { unique: false });
          store.createIndex('status', 'status', { unique: false });
          store.createIndex('protocol', 'protocol', { unique: false });
          store.createIndex('vmIdFragment', 'vmIdFragment', { unique: false });
        }
      };
    });
  }

  async create(record: TransactionRecord): Promise<void> {
    const db = await this.getDB();
    const tx = db.transaction(['transactions'], 'readwrite');
    const store = tx.objectStore('transactions');
    await new Promise<void>((resolve, reject) => {
      const req = store.put(this.serialize(record));
      req.onsuccess = () => resolve();
      req.onerror = () => reject(req.error);
    });
  }

  async update(clientTxRef: string, updates: Partial<TransactionRecord>): Promise<void> {
    const existing = await this.get(clientTxRef);
    if (!existing) return;
    const updated: TransactionRecord = { ...existing, ...updates } as any;
    await this.create(updated);
  }

  async get(clientTxRef: string): Promise<TransactionRecord | null> {
    const db = await this.getDB();
    const tx = db.transaction(['transactions'], 'readonly');
    const store = tx.objectStore('transactions');
    return new Promise((resolve, reject) => {
      const req = store.get(clientTxRef);
      req.onsuccess = () => resolve(req.result ? this.deserialize(req.result) : null);
      req.onerror = () => reject(req.error);
    });
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
    const db = await this.getDB();
    const tx = db.transaction(['transactions'], 'readonly');
    const store = tx.objectStore('transactions');
    const index = store.index('timestamp');

    const items: TransactionRecord[] = [];
    await new Promise<void>((resolve, reject) => {
      const range = undefined; // full scan by time, we will filter in code
      const req = index.openCursor(range, 'prev'); // newest first
      req.onsuccess = () => {
        const cursor = req.result as IDBCursorWithValue | null;
        if (!cursor) return resolve();
        const rec = this.deserialize(cursor.value);
        if (filter?.status && rec.status !== filter.status) return cursor.continue();
        if (filter?.channelId && rec.channelId !== filter.channelId) return cursor.continue();
        if (filter?.protocol && rec.protocol !== filter.protocol) return cursor.continue();
        if (typeof filter?.since === 'number' && rec.timestamp < filter.since)
          return cursor.continue();
        if (typeof filter?.until === 'number' && rec.timestamp > filter.until)
          return cursor.continue();
        items.push(rec);
        cursor.continue();
      };
      req.onerror = () => reject(req.error);
    });

    const offset = pagination?.offset ?? 0;
    const limit = pagination?.limit ?? 50;
    const window = items.slice(offset, offset + limit);
    const total = items.length;
    const hasMore = total > offset + window.length;
    return { items: window, total, hasMore };
  }

  async clear(): Promise<void> {
    const db = await this.getDB();
    const tx = db.transaction(['transactions'], 'readwrite');
    const store = tx.objectStore('transactions');
    await new Promise<void>((resolve, reject) => {
      const req = store.clear();
      req.onsuccess = () => resolve();
      req.onerror = () => reject(req.error);
    });
  }

  subscribe(): () => void {
    // no-op; IndexedDB doesn't have native notifications; implement in caller if needed
    return () => {};
  }

  private serialize(rec: TransactionRecord): any {
    // Convert bigint fields inside payment snapshot to strings
    const copy: any = { ...rec };
    if (copy.payment) {
      copy.payment = {
        ...copy.payment,
        cost: copy.payment.cost.toString(),
        costUsd: copy.payment.costUsd.toString(),
        nonce: copy.payment.nonce.toString(),
      };
    }
    return copy;
  }

  private deserialize(obj: any): TransactionRecord {
    const copy: any = { ...obj };
    if (copy.payment) {
      copy.payment = {
        ...copy.payment,
        cost: BigInt(copy.payment.cost),
        costUsd: BigInt(copy.payment.costUsd),
        nonce: BigInt(copy.payment.nonce),
      };
    }
    return copy as TransactionRecord;
  }
}
