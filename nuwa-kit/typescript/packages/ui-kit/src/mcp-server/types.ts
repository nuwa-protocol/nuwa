// Error types
export class CapUIError extends Error {
  constructor(
    message: string,
    public code?: string,
    public origin?: string
  ) {
    super(message);
    this.name = 'CapUIError';
  }
}

export class TransportError extends CapUIError {
  constructor(message: string, code?: string) {
    super(message, code);
    this.name = 'TransportError';
  }
}

export class SecurityError extends CapUIError {
  constructor(message: string, origin?: string) {
    super(message, 'SECURITY_ERROR', origin);
    this.name = 'SecurityError';
  }
}
