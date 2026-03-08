import { batch, isBatching, scheduleNotification } from './batch.js';
import { getCurrentObserver, runWithObserver, trackSource } from './observer.js';
import { registerObserver, runCleanups } from './observer-utils.js';
import type { InternalComputed, Observer, Owner } from './types.js';

export class ComputedImpl<T> implements InternalComputed<T> {
  _value!: T;
  _version = 0;
  _listeners = new Set<() => void>();
  _watchers = new Set<(n: T, o: T) => void>();
  _knownObservers = new WeakSet<Observer>();
  _equals: (a: T, b: T) => boolean;
  _fn: () => T;
  _error: unknown;
  _hasError = false;
  _isEvaluating = false;

  active = true;
  dirty = false;
  cleanups: (() => void)[] = [];
  children = new Set<Owner>();

  constructor(fn: () => T, equals: (a: T, b: T) => boolean) {
    this._fn = fn;
    this._equals = equals;
    this.notify = this.notify.bind(this);
    this._recompute();
  }

  _recompute() {
    try {
      this._value = runWithObserver(this, this._fn);
      this._hasError = false;
    } catch (error) {
      this._hasError = true;
      this._error = error;
    }
  }

  _evaluate() {
    if (this._isEvaluating) {
      this._hasError = true;
      this._error = new Error('Circular dependency detected. Computed reading itself');
      this._isEvaluating = false;
      return;
    }
    this._isEvaluating = true;
    try {
      const oldValue = this._value;
      runCleanups(this.cleanups);
      this._recompute();
      this.dirty = false;
      if (!this._hasError && !this._equals(this._value, oldValue)) {
        this._version++;
      }
    } finally {
      this._isEvaluating = false;
    }
  }

  get value(): T {
    trackSource(this);
    const currentObserver = getCurrentObserver();
    if (currentObserver && !this._knownObservers.has(currentObserver)) {
      registerObserver(this._knownObservers, this._listeners, currentObserver);
    }
    if (this._hasError && !this.dirty) {
      throw this._error;
    }
    const oldValue = this._value;
    if (this.dirty) {
      this._evaluate();
      if (this._hasError) {
        throw this._error;
      }
      if (!this._equals(this._value, oldValue)) {
        for (const s of [...this._watchers]) s(this._value, oldValue);
      }
    }
    return this._value;
  }

  notify() {
    if (this.dirty) return;
    this.dirty = true;

    if (this._listeners.size === 0 && this._watchers.size === 0) return;

    const propagate = () => {
      this._listeners.forEach((listener) => scheduleNotification(listener));

      if (this._watchers.size > 0) {
        scheduleNotification(() => {
          const oldValue = this._value;
          this._evaluate();
          const valueChanged = !this._equals(this._value, oldValue);
          if (!this._hasError && !valueChanged) return;
          if (valueChanged && this._watchers.size) {
            for (const s of [...this._watchers]) s(this._value, oldValue);
          }
        });
      }
    };
    if (isBatching()) propagate();
    else batch(propagate);
  }

  peek(): T {
    return this._value;
  }

  subscribe(cb: (n: T, o: T) => void) {
    this._watchers.add(cb);
    return () => this._watchers.delete(cb);
  }

  dispose() {
    runCleanups(this.cleanups);
    this.children.forEach((child) => child.dispose());
    this.children.clear();
    this.active = false;
  }
}
