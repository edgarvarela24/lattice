import { batch, isBatching, scheduleNotification } from './batch.js';
import { getCurrentObserver, trackSource } from './observer.js';
import { registerObserver } from './observer-utils.js';
import { InternalSignal, Observer } from './types.js';

export class SignalImpl<T> implements InternalSignal<T> {
  _value: T;
  _version = 0;
  _listeners = new Set<() => void>();
  _watchers = new Set<(n: T, o: T) => void>();
  _knownObservers = new WeakSet<Observer>();
  _equals: (a: T, b: T) => boolean;
  _preBatchValue!: T;
  _hasPrebatchValue = false;

  constructor(value: T, equals: (a: T, b: T) => boolean) {
    this._value = value;
    this._equals = equals;
    this._flushWatchers = this._flushWatchers.bind(this);
  }

  get value(): T {
    trackSource(this);
    const currentObserver = getCurrentObserver();
    if (currentObserver && !this._knownObservers.has(currentObserver)) {
      registerObserver(this._knownObservers, this._listeners, currentObserver);
    }
    return this._value;
  }

  set value(newValue: T) {
    const oldValue = this._value;

    if (this._equals(newValue, oldValue)) {
      return;
    }

    this._value = newValue;
    this._version++;

    if (!this._hasPrebatchValue) {
      this._preBatchValue = oldValue;
      this._hasPrebatchValue = true;
    }

    const notify = () => {
      this._listeners.forEach((listener) => scheduleNotification(listener));
      scheduleNotification(this._flushWatchers);
    };

    if (isBatching()) {
      notify();
    } else {
      batch(notify);
    }
  }

  peek(): T {
    return this._value;
  }

  subscribe(cb: (n: T, o: T) => void) {
    this._watchers.add(cb);
    return () => this._watchers.delete(cb);
  }

  _flushWatchers() {
    if (this._hasPrebatchValue && this._equals(this._value, this._preBatchValue)) {
      this._hasPrebatchValue = false;
      return;
    }
    this._hasPrebatchValue = false;
    for (const s of [...this._watchers]) s(this._value, this._preBatchValue);
  }
}
