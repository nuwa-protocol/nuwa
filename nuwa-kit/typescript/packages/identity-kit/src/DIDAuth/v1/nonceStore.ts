export interface NonceStore {
  tryStoreNonce(
    signerDid: string,
    domainSeparator: string,
    nonce: string,
    ttlSeconds: number
  ): Promise<boolean>;
  sweep?(): Promise<void>;
}

export interface InMemoryNonceStoreOptions {
  capacity?: number;
  sweepIntervalMs?: number;
}

export class InMemoryNonceStore implements NonceStore {
  private readonly capacity: number;
  private readonly map: Map<string, number>; // key -> expiresAt
  private readonly sweepInterval: NodeJS.Timeout;

  constructor(options: InMemoryNonceStoreOptions = {}) {
    this.capacity = options.capacity ?? 100_000;
    this.map = new Map();
    const interval = options.sweepIntervalMs ?? 60_000;
    this.sweepInterval = setInterval(() => {
      this.sweep?.();
    }, interval);
    this.sweepInterval.unref?.();
  }

  private compositeKey(signerDid: string, domainSeparator: string, nonce: string): string {
    return `${signerDid}|${domainSeparator}|${nonce}`;
  }

  async tryStoreNonce(
    signerDid: string,
    domainSeparator: string,
    nonce: string,
    ttlSeconds: number
  ): Promise<boolean> {
    const key = this.compositeKey(signerDid, domainSeparator, nonce);
    const now = Date.now();
    const expiresAt = now + ttlSeconds * 1000;

    const existing = this.map.get(key);
    if (existing && existing > now) {
      return false; // replay
    }
    // size control
    if (this.map.size >= this.capacity) {
      // remove oldest entry
      const firstKey = this.map.keys().next().value as string | undefined;
      if (firstKey) this.map.delete(firstKey);
    }
    this.map.set(key, expiresAt);
    return true;
  }

  async sweep(): Promise<void> {
    const now = Date.now();
    for (const [key, expires] of this.map.entries()) {
      if (expires <= now) {
        this.map.delete(key);
      }
    }
  }
}

// Default global instance
export const defaultNonceStore = new InMemoryNonceStore();
