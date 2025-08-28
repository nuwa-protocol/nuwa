import { describe, test, expect } from '@jest/globals';
import { RequestScheduler } from '../RequestScheduler';

describe('RequestScheduler - cancellation', () => {
  test('removes queued task when handle cancels before start', async () => {
    const scheduler = new RequestScheduler();

    // First task occupies the only concurrency slot
    let releaseT1: (() => void) | undefined;
    let resolveT1!: (v: string) => void;
    const handle1 = scheduler.enqueue<string>(async release => {
      releaseT1 = release;
      return await new Promise<string>(resolve => {
        resolveT1 = resolve; // Controlled externally
      });
    });

    // Ensure T1 has started
    await new Promise(res => setTimeout(res, 10));

    // Second task will be queued, not started yet
    let startedT2 = false;
    const handle2 = scheduler.enqueue<string>(async (_release, signal) => {
      startedT2 = true;
      // Check if already aborted
      if (signal.aborted) {
        throw signal.reason || new Error('Aborted');
      }
      return 't2';
    });

    // Cancel before it can start -> should be removed from queue and reject
    handle2.cancel(new Error('aborted by test'));

    await expect(handle2.promise).rejects.toBeTruthy();
    expect(startedT2).toBe(false);

    // Cleanup: release slot and complete T1 quickly
    releaseT1?.();
    resolveT1('t1');
    await expect(handle1.promise).resolves.toBe('t1');
  });

  test('cancel removes queued task immediately', async () => {
    const scheduler = new RequestScheduler();

    // Occupy slot with T1
    let releaseT1: (() => void) | undefined;
    let resolveT1!: (v: string) => void;
    const handle1 = scheduler.enqueue<string>(async release => {
      releaseT1 = release;
      return await new Promise<string>(resolve => {
        resolveT1 = resolve; // Controlled externally
      });
    });
    await new Promise(res => setTimeout(res, 10));

    // Queue T2
    let startedT2 = false;
    const handle2 = scheduler.enqueue<string>(async (_release, signal) => {
      startedT2 = true;
      // Check if already aborted
      if (signal.aborted) {
        throw signal.reason || new Error('Aborted');
      }
      return 't2';
    });

    // Cancel T2 immediately
    handle2.cancel(new Error('cancelled by test'));

    await expect(handle2.promise).rejects.toBeTruthy();
    expect(startedT2).toBe(false);

    // Cleanup
    releaseT1?.();
    resolveT1('t1');
    await expect(handle1.promise).resolves.toBe('t1');
  });
});
