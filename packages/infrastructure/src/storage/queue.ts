import { StorageError } from '@erp/application';

interface Waiter {
  readonly grant: (release: () => void) => void;
  readonly reject: (error: StorageError) => void;
  readonly timer: ReturnType<typeof setTimeout>;
}

export class Queue {
  private held = false;
  private closed = false;
  private readonly waiters: Waiter[] = [];

  async acquire(): Promise<() => void> {
    if (this.closed) throw new StorageError('CLOSED');
    if (!this.held) {
      this.held = true;
      return () => this.release();
    }
    if (this.waiters.length >= 64) throw new StorageError('BUSY');
    return new Promise((grant, reject) => {
      const waiter: Waiter = {
        grant, reject,
        timer: setTimeout(() => {
          this.waiters.splice(this.waiters.indexOf(waiter), 1);
          reject(new StorageError('BUSY'));
        }, 1000),
      };
      this.waiters.push(waiter);
    });
  }

  close(): void {
    this.closed = true;
    for (const waiter of this.waiters.splice(0)) {
      clearTimeout(waiter.timer);
      waiter.reject(new StorageError('CLOSED'));
    }
  }

  private release(): void {
    const waiter = this.waiters.shift();
    if (waiter) {
      clearTimeout(waiter.timer);
      waiter.grant(() => this.release());
    } else {
      this.held = false;
    }
  }
}
