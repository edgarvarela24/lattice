import { getBatchDepth, getPendingNotifications } from './batch';
import { getCurrentObserver, runWithObserver } from './observer';
import { Computed, ReadonlySignal, SignalOptions, Observer } from './types';

export function computed<T>(fn: () => T, options?: SignalOptions<T>): ReadonlySignal<T> {
  const dependents = new Set<() => void>(); // observer notifies
  const watchers = new Set<(newValue: T, oldValue: T) => void>(); // .subscribe() callbacks
  const knownObservers = new WeakSet<Observer>();
  const equalityCheck = options?.equals ?? Object.is;
  let _value: T;
  let computed: Computed<T>;

  const evaluate = () => {
    computed.cleanups.forEach((cleanup) => cleanup());
    computed.cleanups.length = 0;
    computed.dirty = false;
    _value = runWithObserver(computed, fn);
  };

  computed = {
    get value() {
      const oldValue = _value;
      if (computed.dirty) {
        evaluate();
        if (!equalityCheck(_value, oldValue)) {
          [...watchers].forEach((subscriber) => subscriber(_value, oldValue));
        }
      }
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
    dirty: false,
    cleanups: [],
    children: new Set(),
    invalidate: () => {
      computed.dirty = true;
      if (dependents.size > 0) {
        const oldValue = _value;
        evaluate();
        if (!equalityCheck(_value, oldValue)) {
          if (getBatchDepth() > 0) {
            [...dependents].forEach((subscriber) => getPendingNotifications().add(subscriber));
          } else {
            [...dependents].forEach((subscriber) => subscriber());
          }
        }
      }
    },
    notify: () => {
      computed.invalidate();
    },
    peek() {
      return _value;
    },
    subscribe(callback) {
      watchers.add(callback);
      return () => watchers.delete(callback);
    },
  };
  _value = runWithObserver(computed, fn);
  return computed;
}
