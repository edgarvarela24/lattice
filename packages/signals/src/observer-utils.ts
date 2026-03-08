import { Observer } from './types.js';

export function registerObserver(
  knownObservers: WeakSet<Observer>,
  listeners: Set<() => void>,
  observer: Observer,
): void {
  const callback = observer.notify;
  const cleanup = () => {
    listeners.delete(callback);
    knownObservers.delete(observer);
  };
  knownObservers.add(observer);
  listeners.add(callback);
  observer.cleanups.push(cleanup);
}

export function runCleanups(cleanups: (() => void)[]): void {
  for (const cleanup of cleanups) cleanup();
  cleanups.length = 0;
}
