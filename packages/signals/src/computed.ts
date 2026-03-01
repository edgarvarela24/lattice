import { batch, isBatching, scheduleNotification } from './batch';
import { getCurrentObserver, runWithObserver } from './observer';
import { registerObserver, runCleanups } from './observer-utils';
import { InternalComputed, ReadonlySignal, SignalOptions, Observer } from './types';

export function computed<T>(fn: () => T, options?: SignalOptions<T>): ReadonlySignal<T> {
  const dependents = new Set<() => void>(); // observer notifies
  const watchers = new Set<(newValue: T, oldValue: T) => void>(); // .subscribe() callbacks
  const knownObservers = new WeakSet<Observer>();
  const equalityCheck = options?.equals ?? Object.is;

  let _value: T;
  let computed: InternalComputed<T>;
  let _error: unknown;
  let _hasError: boolean;

  const setValueOrError = () => {
    try {
      _value = runWithObserver(computed, fn);
      _hasError = false;
    } catch (error) {
      _hasError = true;
      _error = error;
    }
  };

  const evaluate = () => {
    runCleanups(computed.cleanups);
    computed.dirty = false;
    setValueOrError();
  };

  computed = {
    get value() {
      const currentObserver = getCurrentObserver();
      if (currentObserver && !knownObservers.has(currentObserver)) {
        registerObserver(knownObservers, dependents, currentObserver);
      }
      if (_hasError && !computed.dirty) {
        throw _error;
      }
      const oldValue = _value;
      if (computed.dirty) {
        evaluate();
        if (_hasError) {
          throw _error;
        }
        if (!equalityCheck(_value, oldValue)) {
          [...watchers].forEach((subscriber) => subscriber(_value, oldValue));
        }
      }

      return _value;
    },
    notify: () => {
      computed.dirty = true;
      if (dependents.size === 0 && watchers.size === 0) return;

      const oldValue = _value;
      evaluate();

      const valueChanged = !_hasError && !equalityCheck(_value, oldValue);

      // Nothing to propagate: no error and value is the same
      if (!_hasError && !valueChanged) return;

      const propagate = () => {
        dependents.forEach((dependent) => scheduleNotification(dependent));
        if (valueChanged) {
          scheduleNotification(() => [...watchers].forEach((w) => w(_value, oldValue)));
        }
      };

      if (isBatching()) {
        propagate();
      } else {
        batch(propagate);
      }
    },
    peek() {
      return _value;
    },
    subscribe(callback) {
      watchers.add(callback);
      return () => watchers.delete(callback);
    },
    dirty: false,
    cleanups: [],
    children: new Set(),
  };

  setValueOrError();

  return computed;
}
