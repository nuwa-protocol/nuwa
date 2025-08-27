import { DebugLogger } from '@nuwa-ai/identity-kit';

type StartFn<T> = (release: () => void) => Promise<T>;

export class RequestScheduler {
  private queue: Array<() => Promise<void>> = [];
  private active = 0;
  private readonly concurrency = 1;
  private logger = DebugLogger.get('RequestScheduler');
  private isShutdown = false;

  enqueue<T>(start: StartFn<T>): Promise<T> {
    return new Promise<T>((outerResolve, outerReject) => {
      // Reject immediately if shutdown
      if (this.isShutdown) {
        outerReject(new Error('RequestScheduler is shutdown'));
        return;
      }
      
      const task = async () => {
        this.active += 1;
        let released = false;
        const release = () => {
          if (released) return;
          released = true;
          this.active -= 1;
          this.flush();
        };
        try {
          const result = await start(release);
          outerResolve(result);
        } catch (e) {
          this.logger.debug('Task failed:', e);
          try {
            release();
          } catch (releaseError) {
            this.logger.debug('Error during release:', releaseError);
          }
          outerReject(e);
          return;
        }
      };
      this.queue.push(task);
      this.flush();
    });
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
