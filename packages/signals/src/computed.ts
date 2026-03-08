import { batch, getFlushId, isBatching, scheduleNotification } from './batch';
import { getCurrentObserver, runWithObserver, trackDependency } from './observer';
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
  let _isEvaluating: boolean;
  let _currentFlushId: string | undefined;
  let _version = 0;

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
    if (_isEvaluating) {
      _hasError = true;
      _error = new Error('Circular dependency detected. Computed reading itself');
      _isEvaluating = false;
      return;
    }
    _isEvaluating = true;
    const oldValue = _value;
    runCleanups(computed.cleanups);
    setValueOrError();
    computed.dirty = false;
    _isEvaluating = false;
    if (!_hasError && !equalityCheck(_value, oldValue)) {
      _version++;
    }
  };

  computed = {
    get _version() {
      return _version;
    },
    get value() {
      trackDependency(computed);
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
      if (computed.dirty) return; // already dirty — stops cycles in propagation
      computed.dirty = true;

      if (dependents.size === 0 && watchers.size === 0) return;

      const propagate = () => {
        // Propagate dirtiness FIRST — before any evaluation
        dependents.forEach((dep) => scheduleNotification(dep));

        // Only schedule evaluation if watchers need push notification
        if (watchers.size > 0) {
          scheduleNotification(() => {
            const currentFlushId = getFlushId();
            if (currentFlushId === _currentFlushId) {
              _hasError = true;
              _error = new Error('Circular dependency detected!');
              _currentFlushId = undefined;
              computed.dirty = false;
              return;
            }
            _currentFlushId = currentFlushId;
            const oldValue = _value;
            evaluate();
            const valueChanged = !equalityCheck(_value, oldValue);
            if (!_hasError && !valueChanged) return;
            if (valueChanged && watchers.size) {
              [...watchers].forEach((w) => w(_value, oldValue));
            }
          });
        }
      };
      if (isBatching()) propagate();
      else batch(propagate);
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
