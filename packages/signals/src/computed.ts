import { getCurrentTracker, runWithTracker } from './tracking';
import { Computed, ReadonlySignal, SignalOptions, Tracker } from './types';

export function computed<T>(fn: () => T, options?: SignalOptions<T>): ReadonlySignal<T> {
  const internalSubscribers = new Set<() => void>(); // tracker notifies
  const publicSubscribers = new Set<(newValue: T, oldValue: T) => void>(); // .subscribe() callbacks
  const trackers = new WeakSet<Tracker>();
  const equalityCheck = options?.equals ?? Object.is;
  let _value: T;
  let computed: Computed<T>;

  const evaluate = () => {
    computed.cleanups.forEach((cleanup) => cleanup());
    computed.cleanups.length = 0;
    computed.dirty = false;
    _value = runWithTracker(computed, fn);
  };

  computed = {
    get value() {
      const oldValue = _value;
      if (computed.dirty) {
        evaluate();
        if (!equalityCheck(_value, oldValue)) {
          [...publicSubscribers].forEach((subscriber) => subscriber(_value, oldValue));
        }
      }
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
    dirty: false,
    cleanups: [],
    notify: () => {
      computed.dirty = true;
      if (internalSubscribers.size > 0) {
        const oldValue = _value;
        evaluate();
        if (!equalityCheck(_value, oldValue)) {
          [...internalSubscribers].forEach((subscriber) => subscriber());
        }
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
  _value = runWithTracker(computed, fn);
  return computed;
}
