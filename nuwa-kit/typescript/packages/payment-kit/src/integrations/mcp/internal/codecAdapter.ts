import type {
  PaymentRequestPayload,
  PaymentResponsePayload,
  SignedSubRAV,
  SubRAV,
} from '../../../core/types';
import { HttpPaymentCodec } from '../../../middlewares/http/HttpPaymentCodec';

/**
 * Convert structured MCP params/result objects to protocol-agnostic payloads
 * and reuse HttpPaymentCodec for streaming frame headerValue encode/decode.
 */

export type McpRequestObject = {
  __nuwa_auth?: string;
  __nuwa_payment?: {
    version: 1;
    clientTxRef: string;
    maxAmount?: string;
    signedSubRav?: any;
  };
} & Record<string, any>;

export type McpResponseObject = {
  data: any;
  __nuwa_payment?: {
    version: 1;
    clientTxRef?: string;
    serviceTxRef?: string;
    subRav?: any;
    cost?: string;
    costUsd?: string;
    error?: { code: string; message?: string };
  };
};

export const codecAdapter = {
  // Request: MCP object -> PaymentRequestPayload
  toHeaderPayload(obj: McpRequestObject): PaymentRequestPayload | null {
    const p = obj?.__nuwa_payment;
    if (!p) return null;
    const payload: PaymentRequestPayload = {
      version: p.version || 1,
      clientTxRef: p.clientTxRef,
      maxAmount: p.maxAmount ? BigInt(p.maxAmount) : BigInt(0),
      signedSubRav: p.signedSubRav ? deserializeSignedSubRAV(p.signedSubRav) : undefined,
    };
    return payload;
  },

  // Response: MCP object -> PaymentResponsePayload
  toResponsePayload(obj: McpResponseObject): PaymentResponsePayload | null {
    const p = obj?.__nuwa_payment;
    if (!p) return null;
    const resp: PaymentResponsePayload = {
      version: p.version || 1,
      clientTxRef: p.clientTxRef,
      serviceTxRef: p.serviceTxRef,
      subRav: p.subRav ? deserializeSubRAV(p.subRav) : undefined,
      cost: p.cost !== undefined ? BigInt(p.cost) : undefined,
      costUsd: p.costUsd !== undefined ? BigInt(p.costUsd) : undefined,
      error: p.error,
    };
    return resp;
  },

  // Streaming: use HttpPaymentCodec for headerValue
  decodeFrame(headerValue: string): PaymentResponsePayload {
    return HttpPaymentCodec.parseResponseHeader(headerValue);
  },
};

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

function deserializeSignedSubRAV(data: Record<string, any> | undefined): SignedSubRAV | undefined {
  if (!data) return undefined;
  return HttpPaymentCodec['deserializeSignedSubRAV']
    ? (HttpPaymentCodec as any).deserializeSignedSubRAV(data)
    : { subRav: deserializeSubRAV(data.subRav), signature: data.signature };
}
