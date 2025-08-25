import { HttpPaymentCodec } from '../../../middlewares/http/HttpPaymentCodec';
import type { SignedSubRAV } from '../../../core/types';

export interface McpPaymentRequestParams {
  __nuwa_auth?: string;
  __nuwa_payment?: {
    version: 1;
    clientTxRef: string;
    maxAmount?: string;
    signedSubRav?: any;
  };
  // Business params follow...
  [key: string]: any;
}

export interface McpPaymentResponseMeta {
  version: 1;
  clientTxRef?: string;
  serviceTxRef?: string;
  subRav?: any;
  cost?: string;
  costUsd?: string;
  error?: { code: string; message?: string };
}

export function extractPaymentFromParams(params: McpPaymentRequestParams): {
  version?: number;
  clientTxRef?: string;
  maxAmount?: bigint;
  signedSubRav?: SignedSubRAV | undefined;
} | null {
  const p = params?.__nuwa_payment;
  if (!p) return null;
  const version = typeof p.version === 'number' ? p.version : 1;
  const clientTxRef = p.clientTxRef;
  const maxAmount = p.maxAmount ? BigInt(p.maxAmount) : undefined;
  const signedSubRav = p.signedSubRav
    ? (HttpPaymentCodec as any).deserializeSignedSubRAV
      ? (HttpPaymentCodec as any).deserializeSignedSubRAV(p.signedSubRav)
      : {
          subRav: {
            version: parseInt(p.signedSubRav.subRav.version),
            chainId: BigInt(p.signedSubRav.subRav.chainId),
            channelId: p.signedSubRav.subRav.channelId,
            channelEpoch: BigInt(p.signedSubRav.subRav.channelEpoch),
            vmIdFragment: p.signedSubRav.subRav.vmIdFragment,
            accumulatedAmount: BigInt(p.signedSubRav.subRav.accumulatedAmount),
            nonce: BigInt(p.signedSubRav.subRav.nonce),
          },
          signature: typeof p.signedSubRav.signature === 'string'
            ? Buffer.from(p.signedSubRav.signature, 'base64url')
            : p.signedSubRav.signature,
        }
    : undefined;
  return { version, clientTxRef, maxAmount, signedSubRav } as any;
}

export function buildResponseMetaFromHeader(headerValue?: string): McpPaymentResponseMeta | undefined {
  if (!headerValue) return undefined;
  const parsed = HttpPaymentCodec.parseResponseHeader(headerValue as any);
  const meta: McpPaymentResponseMeta = {
    version: (parsed.version ?? 1) as 1,
    clientTxRef: parsed.clientTxRef,
    serviceTxRef: parsed.serviceTxRef,
  } as any;
  if (parsed.subRav) {
    meta.subRav = (HttpPaymentCodec as any).serializeSubRAV
      ? (HttpPaymentCodec as any).serializeSubRAV(parsed.subRav)
      : {
          version: parsed.subRav.version.toString(),
          chainId: parsed.subRav.chainId.toString(),
          channelId: parsed.subRav.channelId,
          channelEpoch: parsed.subRav.channelEpoch.toString(),
          vmIdFragment: parsed.subRav.vmIdFragment,
          accumulatedAmount: parsed.subRav.accumulatedAmount.toString(),
          nonce: parsed.subRav.nonce.toString(),
        };
  }
  if (parsed.cost !== undefined) meta.cost = parsed.cost.toString();
  if ((parsed as any).costUsd !== undefined) meta.costUsd = (parsed as any).costUsd.toString();
  if (parsed.error) meta.error = parsed.error;
  return meta;
}


