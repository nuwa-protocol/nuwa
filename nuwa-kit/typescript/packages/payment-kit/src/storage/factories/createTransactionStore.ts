import type { TransactionStore } from '../interfaces/TransactionStore';
import { MemoryTransactionStore } from '../memory/transaction.memory';
import { IndexedDBTransactionStore } from '../indexeddb/transactions.indexeddb';

export interface TransactionStoreOptions {
  backend?: 'memory' | 'indexeddb';
  maxRecords?: number; // memory only
}

export function createTransactionStore(options: TransactionStoreOptions = {}): TransactionStore {
  const backend = options.backend ?? 'memory';
  switch (backend) {
    case 'indexeddb':
      return new IndexedDBTransactionStore();
    case 'memory':
    default:
      return new MemoryTransactionStore(options.maxRecords);
  }
}
