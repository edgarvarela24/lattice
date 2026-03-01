import { Observer } from './types';

export function registerObserver(
  knownObservers: WeakSet<Observer>,
  dependents: Set<() => void>,
  observer: Observer,
): void {
  const callback = observer.notify;
  const cleanup = () => {
    dependents.delete(callback);
    knownObservers.delete(observer);
  };
  knownObservers.add(observer);
  dependents.add(callback);
  observer.cleanups.push(cleanup);
}

export function runCleanups(cleanups: (() => void)[]): void {
  for (const cleanup of cleanups) cleanup();
  cleanups.length = 0;
}
