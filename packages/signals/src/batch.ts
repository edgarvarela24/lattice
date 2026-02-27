let batchDepth = 0;

const pendingNotifications = new Set<() => void>();

export const batch = (fn: () => void): void => {
  batchDepth++;
  try {
    fn();
  } finally {
    if (batchDepth === 1) {
      while (pendingNotifications.size > 0) {
        const queued = [...pendingNotifications];
        pendingNotifications.clear();
        queued.forEach((notification) => notification());
      }
    }
    batchDepth--;
  }
};

export const getBatchDepth = () => {
  return batchDepth;
};

export const getPendingNotifications = () => {
  return pendingNotifications;
};
