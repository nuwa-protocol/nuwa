import { describe, it, expect, beforeEach, afterEach, jest } from '@jest/globals';
import { RequestManager } from '../RequestManager';
import { PaymentState } from '../PaymentState';
import type { PaymentInfo } from '../../../../core/types';

// Mock timers
jest.useFakeTimers();

describe('RequestManager', () => {
  let requestManager: RequestManager;
  let paymentState: PaymentState;

  beforeEach(() => {
    paymentState = new PaymentState();
    requestManager = new RequestManager(paymentState, 5000);
  });

  afterEach(() => {
    jest.clearAllTimers();
  });

  describe('createPaymentPromise', () => {
    it('should create a payment promise and add to pending', async () => {
      const clientTxRef = 'client-tx-123';
      const requestContext = {
        method: 'GET',
        url: 'https://example.com',
        headers: {},
        clientTxRef,
      };

      const promise = requestManager.createPaymentPromise(
        clientTxRef,
        requestContext,
        undefined,
        'channel-123',
        '0x3::gas_coin::RGas'
      );

      expect(promise).toBeInstanceOf(Promise);

      const pending = paymentState.getPendingPayment(clientTxRef);
      expect(pending).toBeDefined();
      expect(pending?.channelId).toBe('channel-123');
      expect(pending?.assetId).toBe('0x3::gas_coin::RGas');
      expect(pending?.requestContext).toEqual(requestContext);
    });

    it('should timeout after specified duration', async () => {
      const clientTxRef = 'client-tx-123';
      const requestContext = {
        method: 'GET',
        url: 'https://example.com',
        headers: {},
        clientTxRef,
      };

      const promise = requestManager.createPaymentPromise(
        clientTxRef,
        requestContext,
        undefined,
        'channel-123',
        '0x3::gas_coin::RGas',
        1000 // 1 second timeout
      );

      // Fast-forward time
      jest.advanceTimersByTime(1000);

      await expect(promise).rejects.toThrow('Payment resolution timeout');
      expect(paymentState.getPendingPayment(clientTxRef)).toBeUndefined();
    });
  });

  describe('extendTimeout', () => {
    it('should extend timeout for pending payment', async () => {
      const clientTxRef = 'client-tx-123';
      const requestContext = {
        method: 'GET',
        url: 'https://example.com',
        headers: {},
        clientTxRef,
      };

      const promise = requestManager.createPaymentPromise(
        clientTxRef,
        requestContext,
        undefined,
        'channel-123',
        '0x3::gas_coin::RGas',
        1000
      );

      // Advance time but not enough to timeout
      jest.advanceTimersByTime(800);

      // Extend timeout
      requestManager.extendTimeout(clientTxRef, 2000);

      // Original timeout would have fired
      jest.advanceTimersByTime(300);

      // Payment should still be pending
      expect(paymentState.getPendingPayment(clientTxRef)).toBeDefined();

      // Now advance to new timeout
      jest.advanceTimersByTime(1700);

      // Should be timed out now
      await expect(promise).rejects.toThrow('Payment resolution timeout');
      expect(paymentState.getPendingPayment(clientTxRef)).toBeUndefined();
    });
  });

  describe('resolveByRef', () => {
    it('should resolve pending payment successfully', async () => {
      const clientTxRef = 'client-tx-123';
      const requestContext = {
        method: 'GET',
        url: 'https://example.com',
        headers: {},
        clientTxRef,
      };

      const promise = requestManager.createPaymentPromise(
        clientTxRef,
        requestContext,
        undefined,
        'channel-123',
        '0x3::gas_coin::RGas'
      );

      const paymentInfo: PaymentInfo = {
        clientTxRef,
        cost: BigInt(100),
        costUsd: BigInt(50),
        nonce: BigInt(1),
        channelId: 'channel-123',
        vmIdFragment: 'key-1',
        assetId: '0x3::gas_coin::RGas',
        timestamp: new Date().toISOString(),
      };

      const resolved = requestManager.resolveByRef(clientTxRef, paymentInfo);
      expect(resolved).toBe(true);

      const result = await promise;
      expect(result).toEqual(paymentInfo);
      expect(paymentState.getPendingPayment(clientTxRef)).toBeUndefined();
    });

    it('should return false for non-existent payment', () => {
      const resolved = requestManager.resolveByRef('non-existent', undefined);
      expect(resolved).toBe(false);
    });

    it('should clear trace origin when resolved', () => {
      const clientTxRef = 'client-tx-123';
      requestManager.recordTraceOrigin(clientTxRef, 'test stack trace');

      const requestContext = {
        method: 'GET',
        url: 'https://example.com',
        headers: {},
        clientTxRef,
      };

      requestManager.createPaymentPromise(
        clientTxRef,
        requestContext,
        undefined,
        'channel-123',
        '0x3::gas_coin::RGas'
      );

      requestManager.resolveByRef(clientTxRef, undefined);
      expect(requestManager.getTraceOrigin(clientTxRef)).toBeUndefined();
    });
  });

  describe('rejectByRef', () => {
    it('should reject pending payment with error', async () => {
      const clientTxRef = 'client-tx-123';
      const requestContext = {
        method: 'GET',
        url: 'https://example.com',
        headers: {},
        clientTxRef,
      };

      const promise = requestManager.createPaymentPromise(
        clientTxRef,
        requestContext,
        undefined,
        'channel-123',
        '0x3::gas_coin::RGas'
      );

      const error = new Error('Test error');
      const rejected = requestManager.rejectByRef(clientTxRef, error);
      expect(rejected).toBe(true);

      await expect(promise).rejects.toThrow('Test error');
      expect(paymentState.getPendingPayment(clientTxRef)).toBeUndefined();
      expect(paymentState.isRecentlyRejected(clientTxRef)).toBe(true);
    });
  });

  describe('rejectAll', () => {
    it('should reject all pending payments', async () => {
      const promises = [];

      for (let i = 0; i < 3; i++) {
        const clientTxRef = `client-tx-${i}`;
        const promise = requestManager.createPaymentPromise(
          clientTxRef,
          {
            method: 'GET',
            url: 'https://example.com',
            headers: {},
            clientTxRef,
          },
          undefined,
          'channel-123',
          '0x3::gas_coin::RGas'
        );
        promises.push(promise);
      }

      expect(paymentState.getAllPendingPayments().size).toBe(3);

      const error = new Error('Reject all');
      requestManager.rejectAll(error);

      for (const promise of promises) {
        await expect(promise).rejects.toThrow('Reject all');
      }

      expect(paymentState.getAllPendingPayments().size).toBe(0);
    });
  });

  describe('resolveAllAsFree', () => {
    it('should resolve all pending payments as free', async () => {
      const promises = [];

      for (let i = 0; i < 3; i++) {
        const clientTxRef = `client-tx-${i}`;
        const promise = requestManager.createPaymentPromise(
          clientTxRef,
          {
            method: 'GET',
            url: 'https://example.com',
            headers: {},
            clientTxRef,
          },
          undefined,
          'channel-123',
          '0x3::gas_coin::RGas'
        );
        promises.push(promise);
      }

      requestManager.resolveAllAsFree();

      for (const promise of promises) {
        const result = await promise;
        expect(result).toBeUndefined();
      }

      expect(paymentState.getAllPendingPayments().size).toBe(0);
    });
  });

  describe('trace origin management', () => {
    it('should record and retrieve trace origins', () => {
      const clientTxRef = 'client-tx-123';
      const origin = 'test stack trace\nat TestFunction';

      requestManager.recordTraceOrigin(clientTxRef, origin);
      expect(requestManager.getTraceOrigin(clientTxRef)).toBe(origin);

      requestManager.clearTraceOrigin(clientTxRef);
      expect(requestManager.getTraceOrigin(clientTxRef)).toBeUndefined();
    });

    it('should get trace snapshots', () => {
      for (let i = 0; i < 10; i++) {
        requestManager.recordTraceOrigin(`tx-${i}`, `stack trace ${i}\nat line ${i}`);
      }

      const snapshots = requestManager.getTraceSnapshots(5);
      expect(snapshots).toHaveLength(5);
      expect(snapshots[0]).toEqual({
        key: 'tx-0',
        head: 'stack trace 0',
      });
    });
  });

  describe('getPendingKeys', () => {
    it('should return all pending payment keys', () => {
      for (let i = 0; i < 3; i++) {
        const clientTxRef = `client-tx-${i}`;
        requestManager.createPaymentPromise(
          clientTxRef,
          {
            method: 'GET',
            url: 'https://example.com',
            headers: {},
            clientTxRef,
          },
          undefined,
          'channel-123',
          '0x3::gas_coin::RGas'
        );
      }

      const keys = requestManager.getPendingKeys();
      expect(keys).toHaveLength(3);
      expect(keys).toContain('client-tx-0');
      expect(keys).toContain('client-tx-1');
      expect(keys).toContain('client-tx-2');
    });
  });
});
