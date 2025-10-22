// Lightweight helper to wrap a streaming Response, parse in-band payment frames,
// and filter them out so the application only sees business data.
// Supports SSE (text/event-stream) and NDJSON (application/x-ndjson).

export interface InBandPaymentPayload {
  // unified payload now carries only encoded header value
  headerValue: string;
}

// The default value of queueHWM
const DEFAULT_QUEUE_HWM: number = 16;

export function wrapAndFilterInBandFrames(
  response: Response,
  onPayment: (payload: InBandPaymentPayload) => void | Promise<void>,
  log: (...args: any[]) => void,
  onActivity?: () => void,
  onFinish?: (opts: { sawPayment: boolean }) => void,
  options?: { backgroundDrain?: boolean; queueHWM?: number }
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

  let sawPayment = false;

  // After payment frame is handled, mark payment as seen but let the stream continue
  const afterPayment = (controller: ReadableStreamDefaultController<Uint8Array>) => {
    try {
      sawPayment = true;
      // Don't close the controller here - let the upstream manage the stream lifecycle
      // The stream should continue processing business data after payment
      log('[afterPayment] Payment processed, continuing stream');
    } catch (e) {
      log('[afterPayment.error]', e);
    }
  };

  const isBg = options?.backgroundDrain !== false; // default true

  const shouldEmit = (controller: ReadableStreamDefaultController<Uint8Array>): boolean => {
    if (isBg) {
      const ds = (controller as any).desiredSize as number | undefined;
      if (typeof ds === 'number' && ds <= 0) return false;
    }
    return true;
  };

  const parser: InBandParser = isSSE
    ? new SseInbandParser(textEncoder, onPayment, log, afterPayment, onActivity, shouldEmit)
    : new NdjsonInbandParser(textEncoder, onPayment, log, afterPayment, onActivity, shouldEmit);

  const makeBackgroundLoop = (controller: ReadableStreamDefaultController<Uint8Array>) => {
    (async () => {
      try {
        while (true) {
          const { value, done } = await reader.read();
          if (done) break;
          if (!value) continue;
          try {
            onActivity?.();
          } catch (e) {
            log('[bg.onActivity.error]', e as any);
          }
          const chunkText = textDecoder.decode(value, { stream: true });
          await parser.process(chunkText, controller);
        }
        await parser.flush(controller);
        // Close the filtered stream when the original stream ends naturally
        controller.close();
        try {
          onFinish?.({ sawPayment });
        } catch (e) {
          log('[finish.error]', e as any);
        }
      } catch (e) {
        try {
          reader.cancel();
        } catch {}
        controller.error(e as any);
      }
    })();
  };

  const filtered = isBg
    ? new ReadableStream<Uint8Array>(
        {
          start(controller) {
            makeBackgroundLoop(controller);
          },
          cancel() {
            try {
              reader.cancel();
            } catch (e) {
              log('[cancel.error]', e);
            }
          },
        },
        { highWaterMark: options?.queueHWM ?? DEFAULT_QUEUE_HWM }
      )
    : new ReadableStream<Uint8Array>({
        async pull(controller) {
          try {
            const { value, done } = await reader.read();
            if (done) {
              await parser.flush(controller);
              // Close the filtered stream when the original stream ends naturally
              controller.close();
              try {
                onFinish?.({ sawPayment });
              } catch (e) {
                log('[finish.error]', e as any);
              }
              return;
            }
            if (!value) return;
            try {
              onActivity?.();
            } catch (e) {
              log('[pull.onActivity.error]', e);
            }
            const chunkText = textDecoder.decode(value, { stream: true });
            await parser.process(chunkText, controller);
          } catch (e) {
            try {
              reader.cancel();
            } catch (e) {
              log('[pull.error]', e);
            }
            controller.error(e);
          }
        },
        cancel() {
          try {
            reader.cancel();
          } catch (e) {
            log('[cancel.error]', e);
          }
        },
      });

  const headers = new Headers(response.headers);
  headers.delete('content-length');
  // Normalize content-type to guide downstream parsers
  try {
    if (isSSE) headers.set('content-type', 'text/event-stream; charset=utf-8');
    else if (isNDJSON) headers.set('content-type', 'application/x-ndjson');
  } catch {}
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
    private onAfterPayment: (controller: ReadableStreamDefaultController<Uint8Array>) => void,
    private onTick?: () => void,
    private shouldEmit?: (c: ReadableStreamDefaultController<Uint8Array>) => boolean
  ) {}

  private extractPaymentHeaderFromEventLines(lines: string[]): string | null {
    for (const l of lines) {
      const m = l.match(/^data:\s*(.+)$/);
      if (!m) continue;
      try {
        const o = JSON.parse(m[1]);
        const header = o?.nuwa_payment_header || o?.__nuwa_payment_header__;
        if (typeof header === 'string') {
          this.log('[extractPaymentHeaderFromEventLines]', header);
          return header;
        }
      } catch {}
    }
    return null;
  }

  private async handleEvent(
    controller: ReadableStreamDefaultController<Uint8Array>
  ): Promise<void> {
    const headerValue = this.extractPaymentHeaderFromEventLines(this.pendingEvent);
    if (!headerValue) {
      for (const out of this.pendingEvent) {
        const bytes = this.encoder.encode(out + '\n');
        // Never drop data lines; rely on controller backpressure
        controller.enqueue(bytes);
      }
      // Ensure SSE event separation with a single blank line delimiter
      const last = this.pendingEvent[this.pendingEvent.length - 1];
      if (last !== '') {
        const sep = this.encoder.encode('\n');
        // Never drop the protocol boundary due to backpressure
        controller.enqueue(sep);
        this.log('[sse.event.emit.sep]', true);
      }

      this.pendingEvent = [];
      return;
    }
    try {
      this.onTick?.();
    } catch (e) {
      this.log('[sse.event.onTick.error]', e);
    }

    await safeHandlePayment({ headerValue }, this.onPayment, this.log);
    this.onAfterPayment(controller);
    this.pendingEvent = [];
  }

  async process(
    textChunk: string,
    controller: ReadableStreamDefaultController<Uint8Array>
  ): Promise<void> {
    this.buffer += textChunk;
    const lines = this.buffer.split(/\r?\n/);
    this.buffer = lines.pop() ?? '';
    for (const line of lines) {
      try {
        this.onTick?.();
      } catch (e) {
        this.log('[sse.event.onTick.error]', e);
      }
      this.pendingEvent.push(line);
      if (line === '') {
        try {
          await this.handleEvent(controller);
        } catch (e) {
          this.log('[process.error]', e);
        }
      }
    }
  }

  async flush(controller: ReadableStreamDefaultController<Uint8Array>): Promise<void> {
    if (!this.buffer) return;
    this.pendingEvent.push(this.buffer);
    try {
      await this.handleEvent(controller);
    } catch (e) {
      this.log('[flush.error]', e);
    }
    this.buffer = '';
  }
}

class NdjsonInbandParser implements InBandParser {
  private buffer = '';
  constructor(
    private encoder: TextEncoder,
    private onPayment: (payload: InBandPaymentPayload) => void | Promise<void>,
    private log: (...args: any[]) => void,
    private onAfterPayment: (controller: ReadableStreamDefaultController<Uint8Array>) => void,
    private onTick?: () => void,
    private shouldEmit?: (c: ReadableStreamDefaultController<Uint8Array>) => boolean
  ) {}

  private extractPaymentHeaderFromLine(t: string): string | null {
    try {
      const obj = JSON.parse(t);
      const headerValue = obj?.__nuwa_payment_header__ || obj?.nuwa_payment_header;
      this.log('[extractPaymentHeaderFromLine]', headerValue);
      return typeof headerValue === 'string' ? headerValue : null;
    } catch {
      return null;
    }
  }

  private async handleLine(
    line: string,
    controller: ReadableStreamDefaultController<Uint8Array>
  ): Promise<void> {
    const t = line.trim();
    if (!t) return;
    try {
      this.log('[ndjson.emit.line]', t.slice(0, 128));
    } catch {}
    const headerValue = this.extractPaymentHeaderFromLine(t);
    if (!headerValue) {
      const bytes = this.encoder.encode(line + '\n');
      // Never drop data lines; rely on controller backpressure
      controller.enqueue(bytes);
      return;
    }
    this.onTick?.();
    await safeHandlePayment({ headerValue }, this.onPayment, this.log);
    this.onAfterPayment(controller);
  }

  async process(
    textChunk: string,
    controller: ReadableStreamDefaultController<Uint8Array>
  ): Promise<void> {
    this.buffer += textChunk;
    const lines = this.buffer.split(/\r?\n/);
    this.buffer = lines.pop() ?? '';
    for (const line of lines) {
      try {
        this.onTick?.();
      } catch {}
      try {
        await this.handleLine(line, controller);
      } catch (e) {
        this.log('[process.error]', e);
      }
    }
  }

  async flush(controller: ReadableStreamDefaultController<Uint8Array>): Promise<void> {
    if (!this.buffer) return;
    try {
      await this.handleLine(this.buffer, controller);
    } catch (e) {
      this.log('[flush.error]', e);
    }
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
