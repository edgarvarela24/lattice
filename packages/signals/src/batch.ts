let batchDepth = 0;

const MAX_ITERATIONS = 10_000;
const pendingNotifications = new Set<() => void>();

export function batch(fn: () => void): void {
  batchDepth++;

  try {
    fn();
  } finally {
    if (batchDepth === 1) {
      try {
        let i = 0;
        while (pendingNotifications.size > 0) {
          if (++i >= MAX_ITERATIONS) {
            pendingNotifications.clear();
            throw new Error('Infinite reactive loop: batch flush exceeded 100 iterations');
          }
          const queued = [...pendingNotifications];
          pendingNotifications.clear();
          queued.forEach((notification) => notification());
        }
      } finally {
        batchDepth--;
      }
    } else {
      batchDepth--;
    }
  }
}

export function isBatching(): boolean {
  return batchDepth > 0;
}

export function scheduleNotification(fn: () => void): void {
  pendingNotifications.add(fn);
}
