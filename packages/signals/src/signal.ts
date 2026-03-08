import { batch, isBatching, scheduleNotification } from './batch.js';
import { registerObserver } from './observer-utils.js';
import { getCurrentObserver, trackDependency } from './observer.js';
import type { Signal, SignalOptions, Observer, InternalSignal } from './types.js';

export function signal<T>(initial: T, options?: SignalOptions<T>): Signal<T> {
  const dependents = new Set<() => void>(); // observer notifies
  const watchers = new Set<(newValue: T, oldValue: T) => void>(); // .subscribe() callbacks
  const knownObservers = new WeakSet<Observer>();
  const equalityCheck = options?.equals ?? Object.is;
  let _value = initial;
  let _preBatchValue: T;
  let _hasPrebatchValue = false;
  let _version = 0;

  const flushWatchers = () => {
    if (_hasPrebatchValue && equalityCheck(_value, _preBatchValue)) {
      _hasPrebatchValue = false;
      return;
    }
    _hasPrebatchValue = false;
    [...watchers].forEach((s) => s(_value, _preBatchValue));
  };

  let signal: InternalSignal<T>;

  signal = {
    get value() {
      trackDependency(signal);
      const currentObserver = getCurrentObserver();
      if (currentObserver && !knownObservers.has(currentObserver)) {
        registerObserver(knownObservers, dependents, currentObserver);
      }
      return _value;
    },
    set value(newValue: T) {
      const oldValue = _value;

      if (equalityCheck(newValue, oldValue)) {
        return;
      }

      _value = newValue;
      _version++;

      if (!_hasPrebatchValue) {
        _preBatchValue = oldValue;
        _hasPrebatchValue = true;
      }

      const notify = () => {
        dependents.forEach((dependent) => scheduleNotification(dependent));
        scheduleNotification(flushWatchers);
      };

      if (isBatching()) {
        notify();
      } else {
        batch(notify);
      }
    },
    peek() {
      return _value;
    },
    subscribe(callback) {
      watchers.add(callback);
      return () => watchers.delete(callback);
    },
    get _version() {
      return _version;
    },
  };
  return signal;
}
