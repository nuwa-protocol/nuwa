// Lightweight helper to wrap a streaming Response, parse in-band payment frames,
// and filter them out so the application only sees business data.
// Supports SSE (text/event-stream) and NDJSON (application/x-ndjson).

export interface InBandPaymentPayload {
  // unified payload now carries only encoded header value
  headerValue: string;
}

export function wrapAndFilterInBandFrames(
  response: Response,
  onPayment: (payload: InBandPaymentPayload) => void | Promise<void>,
  log: (...args: any[]) => void
): Response {
  const originalBody = response.body as ReadableStream<Uint8Array> | null;
  if (!originalBody || typeof (originalBody as any).getReader !== 'function') {
    return response;
  }

  const reader = (originalBody as any).getReader();
  const textDecoder = new TextDecoder();
  const textEncoder = new TextEncoder();

  const ct = (response.headers.get('content-type') || '').toLowerCase();
  const isSSE = ct.includes('text/event-stream');
  const isNDJSON = ct.includes('application/x-ndjson');

  // After payment frame is handled, proactively close the filtered stream to avoid hanging
  const afterPayment = (controller: ReadableStreamDefaultController<Uint8Array>) => {
    try {
      controller.close();
      try { reader.cancel(); } catch {}
    } catch {}
  };

  const parser: InBandParser = isSSE
    ? new SseInbandParser(textEncoder, onPayment, log, afterPayment)
    : new NdjsonInbandParser(textEncoder, onPayment, log, afterPayment);

  const filtered = new ReadableStream<Uint8Array>({
    async pull(controller) {
      try {
        const { value, done } = await reader.read();
        if (done) {
          await parser.flush(controller);
          controller.close();
          return;
        }
        if (!value) return;
        const chunkText = textDecoder.decode(value, { stream: true });
        await parser.process(chunkText, controller);
      } catch (e) {
        try {
          reader.cancel();
        } catch {}
        controller.error(e);
      }
    },
    cancel() {
      try {
        reader.cancel();
      } catch {}
    },
  });

  const headers = new Headers(response.headers);
  headers.delete('content-length');
  const filteredResponse = new Response(filtered as any, {
    status: response.status,
    statusText: response.statusText,
    headers,
  });
  return filteredResponse;
}

// ---------------------------------------------------------------------------
// Parsers
// ---------------------------------------------------------------------------

interface InBandParser {
  process(
    textChunk: string,
    controller: ReadableStreamDefaultController<Uint8Array>
  ): Promise<void>;
  flush(controller: ReadableStreamDefaultController<Uint8Array>): Promise<void>;
}

class SseInbandParser implements InBandParser {
  private buffer = '';
  private pendingEvent: string[] = [];
  constructor(
    private encoder: TextEncoder,
    private onPayment: (payload: InBandPaymentPayload) => void | Promise<void>,
    private log: (...args: any[]) => void,
    private onAfterPayment: (controller: ReadableStreamDefaultController<Uint8Array>) => void
  ) {}

  async process(
    textChunk: string,
    controller: ReadableStreamDefaultController<Uint8Array>
  ): Promise<void> {
    this.buffer += textChunk;
    const lines = this.buffer.split(/\r?\n/);
    this.buffer = lines.pop() ?? '';
    for (const line of lines) {
      this.pendingEvent.push(line);
      if (line === '') {
        const isPayment = this.pendingEvent.some(l => {
          const m = l.match(/^data:\s*(.+)$/);
          if (!m) return false;
          try {
            const o = JSON.parse(m[1]);
            return !!(o?.nuwa_payment_header || o?.__nuwa_payment_header__);
          } catch {
            return false;
          }
        });
        if (!isPayment) {
          for (const out of this.pendingEvent) controller.enqueue(this.encoder.encode(out + '\n'));
        } else {
          try {
            const dataLine = this.pendingEvent.find(l => l.startsWith('data: '));
            if (dataLine) {
              const payload = JSON.parse(dataLine.slice(6));
              const headerValue = payload?.nuwa_payment_header || payload?.__nuwa_payment_header__;
              if (typeof headerValue === 'string') {
                await safeHandlePayment({ headerValue }, this.onPayment, this.log);
                this.onAfterPayment(controller);
              }
            }
          } catch {}
        }
        this.pendingEvent = [];
      }
    }
  }

  async flush(controller: ReadableStreamDefaultController<Uint8Array>): Promise<void> {
    if (!this.buffer) return;
    this.pendingEvent.push(this.buffer);
    const isPayment = this.pendingEvent.some(l => {
      const m = l.match(/^data:\s*(.+)$/);
      if (!m) return false;
      try {
        const o = JSON.parse(m[1]);
        return !!(o?.nuwa_payment_header || o?.__nuwa_payment_header__);
      } catch {
        return false;
      }
    });
    if (!isPayment) {
      for (const out of this.pendingEvent) controller.enqueue(this.encoder.encode(out + '\n'));
    } else {
      try {
        const dataLine = this.pendingEvent.find(l => l.startsWith('data: '));
        if (dataLine) {
          const payload = JSON.parse(dataLine.slice(6));
          const headerValue = payload?.nuwa_payment_header || payload?.__nuwa_payment_header__;
          if (typeof headerValue === 'string') {
            await safeHandlePayment({ headerValue }, this.onPayment, this.log);
            this.onAfterPayment(controller);
          }
        }
      } catch {}
    }
    this.pendingEvent = [];
    this.buffer = '';
  }
}

class NdjsonInbandParser implements InBandParser {
  private buffer = '';
  constructor(
    private encoder: TextEncoder,
    private onPayment: (payload: InBandPaymentPayload) => void | Promise<void>,
    private log: (...args: any[]) => void,
    private onAfterPayment: (controller: ReadableStreamDefaultController<Uint8Array>) => void
  ) {}

  async process(
    textChunk: string,
    controller: ReadableStreamDefaultController<Uint8Array>
  ): Promise<void> {
    this.buffer += textChunk;
    const lines = this.buffer.split(/\r?\n/);
    this.buffer = lines.pop() ?? '';
    for (const line of lines) {
      const t = line.trim();
      if (!t) continue;
      let drop = false;
      try {
        const obj = JSON.parse(t);
        const headerValue = obj?.__nuwa_payment_header__ || obj?.nuwa_payment_header;
        if (typeof headerValue === 'string') {
          drop = true;
          await safeHandlePayment({ headerValue }, this.onPayment, this.log);
          this.onAfterPayment(controller);
        }
      } catch {}
      if (!drop) controller.enqueue(this.encoder.encode(line + '\n'));
    }
  }

  async flush(controller: ReadableStreamDefaultController<Uint8Array>): Promise<void> {
    if (!this.buffer) return;
    const t = this.buffer.trim();
    let drop = false;
    try {
      const obj = JSON.parse(t);
      const headerValue = obj?.__nuwa_payment_header__ || obj?.nuwa_payment_header;
      if (typeof headerValue === 'string') {
        drop = true;
        await safeHandlePayment({ headerValue }, this.onPayment, this.log);
        this.onAfterPayment(controller);
      }
    } catch {}
    if (!drop) controller.enqueue(this.encoder.encode(this.buffer + '\n'));
    this.buffer = '';
  }
}

async function safeHandlePayment(
  p: any,
  onPayment: (payload: InBandPaymentPayload) => void | Promise<void>,
  log: (...args: any[]) => void
): Promise<void> {
  try {
    if (p && typeof p.headerValue === 'string') {
      await onPayment(p as InBandPaymentPayload);
    }
  } catch (e) {
    log('[inband.handle.error]', (e as Error)?.message || String(e));
  }
}
