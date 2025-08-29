import { DebugLogger } from '@nuwa-ai/identity-kit';

type StartFn<T> = (release: () => void, signal: AbortSignal) => Promise<T>;

export interface ScheduledTaskHandle<T> {
  promise: Promise<T>;
  cancel: (reason?: any) => void;
}

export class RequestScheduler {
  private queue: Array<() => Promise<void>> = [];
  private active = 0;
  private readonly concurrency = 1;
  private logger = DebugLogger.get('RequestScheduler');
  private isShutdown = false;

  enqueue<T>(start: StartFn<T>): ScheduledTaskHandle<T> {
    let cancelFn: (reason?: any) => void = () => {};
    const promise = new Promise<T>((outerResolve, outerReject) => {
      // Reject immediately if shutdown
      if (this.isShutdown) {
        outerReject(new Error('RequestScheduler is shutdown'));
        return;
      }

      const schedulerController = new AbortController();
      let settled = false;
      const safeResolve = (value: T) => {
        if (settled) return;
        settled = true;
        outerResolve(value);
      };
      const safeReject = (reason: any) => {
        if (settled) return;
        settled = true;
        outerReject(reason);
      };

      const task = async () => {
        this.active += 1;
        let released = false;
        const release = () => {
          if (released) return;
          released = true;
          this.active -= 1;
          this.flush();
        };

        // Create an abort promise to race against the task start
        const abortPromise = new Promise<T>((_resolve, reject) => {
          const onAbort = () => {
            try {
              reject(schedulerController.signal.reason || new Error('Task aborted'));
            } catch {
              reject(new Error('Task aborted'));
            }
          };
          if (schedulerController.signal.aborted) {
            onAbort();
          } else {
            schedulerController.signal.addEventListener('abort', onAbort, { once: true });
          }
        });

        try {
          const result = await Promise.race([
            start(release, schedulerController.signal),
            abortPromise,
          ]);
          safeResolve(result);
        } catch (e) {
          this.logger.debug('Task failed:', e);
          safeReject(e);
        } finally {
          try {
            release();
          } catch (releaseError) {
            this.logger.debug('Error during release:', releaseError);
          }
        }
      };

      cancelFn = (reason?: any) => {
        // Try to remove from queue if not yet started
        const idx = this.queue.indexOf(task);
        if (idx >= 0) {
          this.queue.splice(idx, 1);
          // Defer rejection to ensure external handlers can attach first
          setTimeout(() => safeReject(reason || new Error('Task cancelled')), 0);
          try {
            schedulerController.abort(reason);
          } catch {}
          return;
        }
        // If already started, signal abort and let the abortPromise reject the task
        try {
          schedulerController.abort(reason);
        } catch {}
      };

      this.queue.push(task);
      this.flush();
    });
    return { promise, cancel: cancelFn };
  }

  private flush() {
    while (this.active < this.concurrency && this.queue.length > 0) {
      const next = this.queue.shift()!;
      void next();
    }
  }

  /**
   * Clear the queue and prevent any new tasks from being enqueued
   */
  clear(): void {
    this.isShutdown = true;
    const queueSize = this.queue.length;
    this.queue = [];
    this.logger.debug('RequestScheduler cleared, queue size was:', queueSize);
  }
}
