import { PaymentProtocol } from '../PaymentProtocol';
import { PaymentKitError } from '../../../../errors';
import { PaymentErrorCode } from '../../../../errors/codes';
import { HttpPaymentCodec } from '../../internal/codec';
import type { SubRAV, SignedSubRAV } from '../../../../core/types';
import { MultibaseCodec } from '@nuwa-ai/identity-kit';

describe('PaymentProtocol', () => {
  let protocol: PaymentProtocol;

  beforeEach(() => {
    protocol = new PaymentProtocol();
  });

  describe('encodeRequestHeader', () => {
    it('should encode request header with signed SubRAV', () => {
      const signedSubRAV: SignedSubRAV = {
        subRav: {
          version: 1,
          chainId: BigInt(4),
          channelId: 'channel-123',
          channelEpoch: BigInt(1),
          vmIdFragment: 'key-1',
          nonce: BigInt(1),
          accumulatedAmount: BigInt(100),
        },
        signature: new Uint8Array([1, 2, 3, 4]),
      };

      const header = protocol.encodeRequestHeader(signedSubRAV, 'client-tx-123', BigInt(1000));

      expect(header).toBeDefined();
      expect(typeof header).toBe('string');
    });

    it('should encode request header without signed SubRAV (FREE mode)', () => {
      const header = protocol.encodeRequestHeader(undefined, 'client-tx-123', BigInt(0));

      expect(header).toBeDefined();
      expect(typeof header).toBe('string');
    });
  });

  describe('parseProtocolFromResponse', () => {
    it('should return none when no payment header present', () => {
      const response = new Response('', {
        headers: {
          'Content-Type': 'application/json',
        },
      });

      const result = protocol.parseProtocolFromResponse(response);
      expect(result.type).toBe('none');
    });

    it('should parse error response', () => {
      const errorData = {
        error: {
          code: PaymentErrorCode.PAYMENT_REQUIRED,
          message: 'Insufficient balance',
        },
        clientTxRef: 'client-tx-123',
      };

      const headerValue = MultibaseCodec.encodeBase64url(JSON.stringify(errorData));
      const response = new Response('', {
        status: 402,
        headers: {
          [HttpPaymentCodec.getHeaderName()]: headerValue,
        },
      });

      const result = protocol.parseProtocolFromResponse(response);
      expect(result.type).toBe('error');
      if (result.type === 'error') {
        expect(result.clientTxRef).toBe('client-tx-123');
        expect(result.err).toBeInstanceOf(PaymentKitError);
        expect(result.err.code).toBe(PaymentErrorCode.PAYMENT_REQUIRED);
        expect(result.err.message).toBe('Insufficient balance');
      }
    });

    it('should parse success response', () => {
      const subRav: SubRAV = {
        version: 1,
        chainId: BigInt(4),
        channelId: 'channel-123',
        channelEpoch: BigInt(1),
        vmIdFragment: 'key-1',
        nonce: BigInt(2),
        accumulatedAmount: BigInt(200),
      };

      const successData = {
        subRav: {
          version: subRav.version,
          chainId: subRav.chainId.toString(),
          channelId: subRav.channelId,
          channelEpoch: subRav.channelEpoch.toString(),
          vmIdFragment: subRav.vmIdFragment,
          nonce: subRav.nonce.toString(),
          accumulatedAmount: subRav.accumulatedAmount.toString(),
        },
        cost: '50',
        costUsd: '100',
        clientTxRef: 'client-tx-123',
        serviceTxRef: 'service-tx-456',
      };

      const headerValue = MultibaseCodec.encodeBase64url(JSON.stringify(successData));
      const response = new Response('', {
        headers: {
          [HttpPaymentCodec.getHeaderName()]: headerValue,
        },
      });

      const result = protocol.parseProtocolFromResponse(response);
      expect(result.type).toBe('success');
      if (result.type === 'success') {
        expect(result.clientTxRef).toBe('client-tx-123');
        expect(result.subRav).toMatchObject({
          ...subRav,
          accumulatedAmount: BigInt(200),
          nonce: BigInt(2),
        });
        expect(result.cost).toBe(BigInt(50));
        expect(result.costUsd).toBe(BigInt(100));
        expect(result.serviceTxRef).toBe('service-tx-456');
      }
    });

    it('should handle case-insensitive header lookup', () => {
      const successData = {
        subRav: {
          version: 1,
          chainId: '4',
          channelId: 'channel-123',
          channelEpoch: '1',
          vmIdFragment: 'key-1',
          nonce: '1',
          accumulatedAmount: '100',
        },
        cost: '50',
      };

      const headerValue = MultibaseCodec.encodeBase64url(JSON.stringify(successData));
      const response = new Response('', {
        headers: {
          [HttpPaymentCodec.getHeaderName().toLowerCase()]: headerValue,
        },
      });

      const result = protocol.parseProtocolFromResponse(response);
      expect(result.type).toBe('success');
    });
  });

  describe('handleStatusCode', () => {
    it('should return PaymentKitError for 402 status', () => {
      const error = protocol.handleStatusCode(402);
      expect(error).toBeInstanceOf(PaymentKitError);
      expect(error?.code).toBe(PaymentErrorCode.PAYMENT_REQUIRED);
      expect(error?.httpStatus).toBe(402);
    });

    it('should return PaymentKitError for 409 status', () => {
      const error = protocol.handleStatusCode(409);
      expect(error).toBeInstanceOf(PaymentKitError);
      expect(error?.code).toBe(PaymentErrorCode.RAV_CONFLICT);
      expect(error?.httpStatus).toBe(409);
    });

    it('should return null for other status codes', () => {
      expect(protocol.handleStatusCode(200)).toBeNull();
      expect(protocol.handleStatusCode(404)).toBeNull();
      expect(protocol.handleStatusCode(500)).toBeNull();
    });
  });

  describe('getHeaderName', () => {
    it('should return the correct header name', () => {
      expect(protocol.getHeaderName()).toBe(HttpPaymentCodec.getHeaderName());
    });
  });

  describe('parseResponseHeader', () => {
    it('should parse response header correctly', () => {
      const data = {
        subRav: {
          version: 1,
          chainId: '4',
          channelId: 'channel-123',
          channelEpoch: '1',
          vmIdFragment: 'key-1',
          nonce: '1',
          accumulatedAmount: '100',
        },
        cost: '50',
        clientTxRef: 'client-tx-123',
      };

      const headerValue = MultibaseCodec.encodeBase64url(JSON.stringify(data));
      const parsed = protocol.parseResponseHeader(headerValue);

      expect(parsed).toBeDefined();
      expect(parsed.clientTxRef).toBe('client-tx-123');
      expect(parsed.cost).toBe(BigInt(50));
    });

    it('should throw on invalid header value', () => {
      expect(() => {
        protocol.parseResponseHeader('invalid-base64');
      }).toThrow();
    });
  });
});
