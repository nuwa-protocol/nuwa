type StartFn<T> = (release: () => void) => Promise<T>;

export class RequestScheduler {
  private queue: Array<() => Promise<void>> = [];
  private active = 0;
  private readonly concurrency = 1;

  enqueue<T>(start: StartFn<T>): Promise<T> {
    return new Promise<T>((outerResolve, outerReject) => {
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
          try {
            release();
          } catch {}
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
}
