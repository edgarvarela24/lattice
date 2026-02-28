import { batch, getBatchDepth, getPendingNotifications } from './batch.js';
import { getCurrentObserver } from './observer.js';
import type { Signal, SignalOptions, Observer } from './types.js';

export function signal<T>(initial: T, options?: SignalOptions<T>): Signal<T> {
  const dependents = new Set<() => void>(); // observer notifies
  const watchers = new Set<(newValue: T, oldValue: T) => void>(); // .subscribe() callbacks
  const knownObservers = new WeakSet<Observer>();
  const equalityCheck = options?.equals ?? Object.is;
  let _value = initial;
  let _preBatchValue: T;
  let _hasPrebatchValue = false;

  const flushWatchers = () => {
    if (_hasPrebatchValue && equalityCheck(_value, _preBatchValue)) {
      _hasPrebatchValue = false;
      return;
    }
    _hasPrebatchValue = false;
    [...watchers].forEach((s) => s(_value, _preBatchValue));
  };

  return {
    get value() {
      const currentObserver = getCurrentObserver();
      if (currentObserver && !knownObservers.has(currentObserver)) {
        const callback = currentObserver.notify;
        const cleanupFn = () => {
          dependents.delete(callback);
          knownObservers.delete(currentObserver);
        };
        knownObservers.add(currentObserver);
        dependents.add(callback);
        currentObserver.cleanups.push(cleanupFn);
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
        getPendingNotifications().add(flushWatchers);
        [...dependents].forEach((subscriber) => getPendingNotifications().add(subscriber));
      } else {
        batch(() => {
          [...dependents].forEach((subscriber) => subscriber());
          [...watchers].forEach((subscriber) => subscriber(newValue, oldValue));
        });
      }
    },
    peek() {
      return _value;
    },
    subscribe(callback) {
      watchers.add(callback);
      return () => watchers.delete(callback);
    },
  };
}
