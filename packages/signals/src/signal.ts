import { batch, getBatchDepth, getPendingNotifications } from './batch.js';
import { getCurrentTracker } from './tracking.js';
import type { Signal, SignalOptions, Tracker } from './types.js';

export function signal<T>(initial: T, options?: SignalOptions<T>): Signal<T> {
  const internalSubscribers = new Set<() => void>(); // tracker notifies
  const publicSubscribers = new Set<(newValue: T, oldValue: T) => void>(); // .subscribe() callbacks
  const trackers = new WeakSet<Tracker>();
  const equalityCheck = options?.equals ?? Object.is;
  let _value = initial;
  let _preBatchValue: T;
  let _hasPrebatchValue = false;

  const flushPublicSubscribers = () => {
    if (_hasPrebatchValue && equalityCheck(_value, _preBatchValue)) {
      _hasPrebatchValue = false;
      return;
    }
    _hasPrebatchValue = false;
    [...publicSubscribers].forEach((s) => s(_value, _preBatchValue));
  };

  return {
    get value() {
      const currentTracker = getCurrentTracker();
      if (currentTracker && !trackers.has(currentTracker)) {
        const callback = currentTracker.notify;
        const cleanupFn = () => {
          internalSubscribers.delete(callback);
          trackers.delete(currentTracker);
        };
        trackers.add(currentTracker);
        internalSubscribers.add(callback);
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
      if (getBatchDepth() > 0) {
        if (!_hasPrebatchValue) {
          _preBatchValue = oldValue;
          _hasPrebatchValue = true;
        }
        getPendingNotifications().add(flushPublicSubscribers);
        [...internalSubscribers].forEach((subscriber) => getPendingNotifications().add(subscriber));
      } else {
        batch(() => {
          [...internalSubscribers].forEach((subscriber) => subscriber());
          [...publicSubscribers].forEach((subscriber) => subscriber(newValue, oldValue));
        });
      }
    },
    peek() {
      return _value;
    },
    subscribe(callback) {
      publicSubscribers.add(callback);
      return () => publicSubscribers.delete(callback);
    },
  };
}
