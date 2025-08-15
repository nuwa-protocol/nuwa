import type { PaymentInfo } from '../../core/types';

export type TransactionStatus = 'pending' | 'free' | 'paid' | 'error';

export interface PaymentSnapshot {
  cost: bigint;
  costUsd: bigint;
  nonce: bigint;
  serviceTxRef?: string;
}

export interface TransactionRecord {
  // Identity & correlation (use clientTxRef as the unique id)
  clientTxRef: string;
  timestamp: number; // Created at (ms)

  // Request side (protocol-agnostic)
  protocol: 'http' | 'mcp' | 'other';
  method?: 'GET' | 'POST' | 'PUT' | 'DELETE' | 'PATCH';
  urlOrTarget: string;
  operation?: string;
  headersSummary?: Record<string, string>;
  requestBodyHash?: string;
  stream: boolean;

  // Channel & payment
  channelId?: string;
  vmIdFragment?: string;
  assetId?: string;
  payment?: PaymentSnapshot;

  // Response
  statusCode?: number;
  durationMs?: number;

  // State
  status: TransactionStatus;
  errorMessage?: string;
  errorCode?: string;

  // Extensibility
  meta?: Record<string, any>;
}

export interface TransactionStore {
  create(record: TransactionRecord): Promise<void>;
  update(clientTxRef: string, updates: Partial<TransactionRecord>): Promise<void>;
  get(clientTxRef: string): Promise<TransactionRecord | null>;
  list(
    filter?: {
      status?: TransactionStatus;
      channelId?: string;
      protocol?: 'http' | 'mcp' | 'other';
      since?: number;
      until?: number;
    },
    pagination?: { offset?: number; limit?: number }
  ): Promise<{ items: TransactionRecord[]; total: number; hasMore: boolean }>;
  clear(): Promise<void>;
  subscribe?(
    cb: (event: { type: 'created' | 'updated'; record: TransactionRecord }) => void
  ): () => void;
}
