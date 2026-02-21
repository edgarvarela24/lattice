import { Signal, SignalOptions } from './types';

export function signal<T>(initial: T, options?: SignalOptions<T>): Signal<T> {
  const subscribers = new Set<(newValue: T, oldValue: T) => void>();
  const equalityCheck = options?.equals ?? Object.is;
  let _value = initial;

  return {
    get value() {
      return _value;
    },
    set value(newValue: T) {
      const oldValue = _value;
      // Don't notify if same value
      if (equalityCheck(newValue, oldValue)) {
        return;
      }
      _value = newValue;
      subscribers.forEach((subscriber) => subscriber(newValue, oldValue));
    },
    peek() {
      return _value;
    },
    subscribe(callback: (newValue: T, oldValue: T) => void) {
      subscribers.add(callback);
      return () => subscribers.delete(callback);
    },
  };
}
