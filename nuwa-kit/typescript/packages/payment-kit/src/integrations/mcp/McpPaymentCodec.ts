import type { PaymentCodec } from '../../codecs/PaymentCodec';
import type { PaymentRequestPayload, PaymentResponsePayload, SubRAV } from '../../core/types';
import { HttpPaymentCodec } from '../../middlewares/http/HttpPaymentCodec';

/**
 * MCP codec: structured JSON in params/result for non-streaming,
 * and reuse HttpPaymentCodec for streaming headerValue frames.
 */
export class McpPaymentCodec implements PaymentCodec {
  encodePayload(payload: PaymentRequestPayload): Record<string, any> {
    return {
      version: payload.version,
      clientTxRef: payload.clientTxRef,
      maxAmount: payload.maxAmount.toString(),
      signedSubRav: payload.signedSubRav
        ? ((HttpPaymentCodec as any).serializeSignedSubRAV?.(payload.signedSubRav) ?? {
            subRav: serializeSubRAV(payload.signedSubRav.subRav),
            signature: payload.signedSubRav.signature,
          })
        : undefined,
    };
  }

  decodePayload(input: string | Record<string, any>): PaymentRequestPayload {
    if (typeof input === 'string') {
      // Allow base64url headerValue in edge cases; parse via HTTP codec
      return HttpPaymentCodec.parseRequestHeader(input);
    }
    const p = input as any;
    return {
      version: p.version || 1,
      clientTxRef: p.clientTxRef,
      maxAmount: p.maxAmount ? BigInt(p.maxAmount) : BigInt(0),
      signedSubRav: p.signedSubRav
        ? ((HttpPaymentCodec as any).deserializeSignedSubRAV?.(p.signedSubRav) ?? {
            subRav: deserializeSubRAV(p.signedSubRav.subRav),
            signature: p.signedSubRav.signature,
          })
        : undefined,
    };
  }

  encodeResponse(
    subRAV: SubRAV,
    cost: bigint,
    serviceTxRef: string,
    metadata?: any
  ): Record<string, any> {
    return {
      version: 1,
      clientTxRef: metadata?.clientTxRef,
      serviceTxRef,
      subRav: serializeSubRAV(subRAV),
      cost: cost.toString(),
      costUsd: metadata?.costUsd ? metadata.costUsd.toString() : undefined,
    };
  }

  encodeError(
    error: { code: string; message?: string },
    metadata?: { clientTxRef?: string; serviceTxRef?: string; version?: number }
  ): Record<string, any> {
    return {
      version: metadata?.version ?? 1,
      clientTxRef: metadata?.clientTxRef,
      serviceTxRef: metadata?.serviceTxRef,
      error,
    };
  }

  decodeResponse(input: string | Record<string, any>): PaymentResponsePayload {
    if (typeof input === 'string') {
      // streaming frame headerValue
      return HttpPaymentCodec.parseResponseHeader(input);
    }
    const p = input as any;
    const out: PaymentResponsePayload = {
      version: p.version || 1,
      clientTxRef: p.clientTxRef,
      serviceTxRef: p.serviceTxRef,
      subRav: p.subRav ? deserializeSubRAV(p.subRav) : undefined,
      cost: p.cost !== undefined ? BigInt(p.cost) : undefined,
      costUsd: p.costUsd !== undefined ? BigInt(p.costUsd) : undefined,
      error: p.error,
    };
    return out;
  }
}

function serializeSubRAV(subRav: SubRAV): Record<string, string> {
  return {
    version: subRav.version.toString(),
    chainId: subRav.chainId.toString(),
    channelId: subRav.channelId,
    channelEpoch: subRav.channelEpoch.toString(),
    vmIdFragment: subRav.vmIdFragment,
    accumulatedAmount: subRav.accumulatedAmount.toString(),
    nonce: subRav.nonce.toString(),
  };
}

function deserializeSubRAV(data: Record<string, string>): SubRAV {
  return {
    version: parseInt(data.version),
    chainId: BigInt(data.chainId),
    channelId: data.channelId,
    channelEpoch: BigInt(data.channelEpoch),
    vmIdFragment: data.vmIdFragment,
    accumulatedAmount: BigInt(data.accumulatedAmount),
    nonce: BigInt(data.nonce),
  };
}
