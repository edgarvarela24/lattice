import { getCurrentTracker } from './tracking.js';
import type { Signal, SignalOptions, Tracker } from './types.js';

export function signal<T>(initial: T, options?: SignalOptions<T>): Signal<T> {
  const subscribers = new Set<(newValue: T, oldValue: T) => void>();
  const trackers = new WeakSet<Tracker>();
  const equalityCheck = options?.equals ?? Object.is;
  let _value = initial;

  return {
    get value() {
      const currentTracker = getCurrentTracker();
      if (currentTracker && !trackers.has(currentTracker)) {
        const callback = currentTracker.notify;
        const cleanupFn = () => {
          subscribers.delete(callback);
          trackers.delete(currentTracker);
        };
        trackers.add(currentTracker);
        subscribers.add(callback);
        currentTracker.cleanups.push(cleanupFn);
      }
      return _value;
    },
    set value(newValue: T) {
      const oldValue = _value;
      if (equalityCheck(newValue, oldValue)) {
        return;
      }
      _value = newValue;
      [...subscribers].forEach((subscriber) => subscriber(newValue, oldValue));
    },
    peek() {
      return _value;
    },
    subscribe(callback) {
      subscribers.add(callback);
      return () => subscribers.delete(callback);
    },
  };
}
