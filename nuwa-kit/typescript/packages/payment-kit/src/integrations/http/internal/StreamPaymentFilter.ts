// Lightweight helper to wrap a streaming Response, parse in-band payment frames,
// and filter them out so the application only sees business data.
// Supports SSE (text/event-stream) and NDJSON (application/x-ndjson).

export interface InBandPaymentPayload {
  subRav: any;
  cost: string | number | bigint;
  costUsd?: string | number | bigint;
  clientTxRef?: string;
  serviceTxRef?: string;
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
  let buffer = '';
  let pendingEvent: string[] = [];

  const ct = (response.headers.get('content-type') || '').toLowerCase();
  const isSSE = ct.includes('text/event-stream');
  const isNDJSON = ct.includes('application/x-ndjson');

  const filtered = new ReadableStream<Uint8Array>({
    async pull(controller) {
      try {
        const { value, done } = await reader.read();
        if (done) {
          // flush remaining buffer
          if (buffer) {
            if (isNDJSON) {
              const t = buffer.trim();
              let drop = false;
              try {
                const obj = JSON.parse(t);
                drop = !!(obj?.__nuwa_payment__ || obj?.nuwa_payment);
                if (drop) {
                  const p = obj?.__nuwa_payment__ || obj?.nuwa_payment;
                  await safeHandlePayment(p, onPayment, log);
                }
              } catch {}
              if (!drop) controller.enqueue(textEncoder.encode(buffer + '\n'));
            } else if (isSSE) {
              pendingEvent.push(buffer);
              const isPayment =
                pendingEvent.some(l => l.trim() === 'event: nuwa-payment') ||
                pendingEvent.some(l => {
                  const m = l.match(/^data:\s*(.+)$/);
                  if (!m) return false;
                  try {
                    const o = JSON.parse(m[1]);
                    return !!(o?.nuwa_payment || o?.__nuwa_payment__);
                  } catch {
                    return false;
                  }
                });
              if (!isPayment) {
                for (const out of pendingEvent) controller.enqueue(textEncoder.encode(out + '\n'));
              } else {
                try {
                  const dataLine = pendingEvent.find(l => l.startsWith('data: '));
                  if (dataLine) {
                    const payload = JSON.parse(dataLine.slice(6));
                    const p = payload?.nuwa_payment || payload?.__nuwa_payment__;
                    await safeHandlePayment(p, onPayment, log);
                  }
                } catch {}
              }
            }
          }
          controller.close();
          return;
        }
        if (!value) return;
        const chunkText = textDecoder.decode(value, { stream: true });
        buffer += chunkText;

        if (isSSE) {
          const lines = buffer.split(/\r?\n/);
          buffer = lines.pop() ?? '';
          for (const line of lines) {
            pendingEvent.push(line);
            if (line === '') {
              const isPayment =
                pendingEvent.some(l => l.trim() === 'event: nuwa-payment') ||
                pendingEvent.some(l => {
                  const m = l.match(/^data:\s*(.+)$/);
                  if (!m) return false;
                  try {
                    const o = JSON.parse(m[1]);
                    return !!(o?.nuwa_payment || o?.__nuwa_payment__);
                  } catch {
                    return false;
                  }
                });
              if (!isPayment) {
                for (const out of pendingEvent) controller.enqueue(textEncoder.encode(out + '\n'));
              } else {
                try {
                  const dataLine = pendingEvent.find(l => l.startsWith('data: '));
                  if (dataLine) {
                    const payload = JSON.parse(dataLine.slice(6));
                    const p = payload?.nuwa_payment || payload?.__nuwa_payment__;
                    await safeHandlePayment(p, onPayment, log);
                  }
                } catch {}
              }
              pendingEvent = [];
            }
          }
          return;
        }

        if (isNDJSON) {
          const lines = buffer.split(/\r?\n/);
          buffer = lines.pop() ?? '';
          for (const line of lines) {
            const t = line.trim();
            if (!t) continue;
            let drop = false;
            try {
              const obj = JSON.parse(t);
              const p = obj?.__nuwa_payment__ || obj?.nuwa_payment;
              if (p && p.subRav && p.cost !== undefined) {
                drop = true;
                await safeHandlePayment(p, onPayment, log);
              }
            } catch {}
            if (!drop) controller.enqueue(textEncoder.encode(line + '\n'));
          }
          return;
        }

        // Fallback: not recognized as SSE/NDJSON, forward as-is
        controller.enqueue(value);
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

async function safeHandlePayment(
  p: any,
  onPayment: (payload: InBandPaymentPayload) => void | Promise<void>,
  log: (...args: any[]) => void
): Promise<void> {
  try {
    if (p && p.subRav && p.cost !== undefined) {
      await onPayment(p as InBandPaymentPayload);
    }
  } catch (e) {
    log('[inband.handle.error]', (e as Error)?.message || String(e));
  }
}
