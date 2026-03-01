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

  const evaluate = () => {
    runCleanups(computed.cleanups);
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
        registerObserver(knownObservers, dependents, currentObserver);
      }
      return _value;
    },
    dirty: false,
    cleanups: [],
    children: new Set(),
    notify: () => {
      computed.dirty = true;
      if (dependents.size > 0 || watchers.size > 0) {
        const oldValue = _value;
        evaluate();
        if (!equalityCheck(_value, oldValue)) {
          const propagate = () => {
            dependents.forEach((dependent) => scheduleNotification(dependent));
            scheduleNotification(() => [...watchers].forEach((w) => w(_value, oldValue)));
          };
          if (isBatching()) {
            propagate();
          } else {
            batch(propagate);
          }
        }
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
  _value = runWithObserver(computed, fn);
  return computed;
}
