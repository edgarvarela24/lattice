import { SignalImpl } from './signal-impl.js';
import type { Signal, SignalOptions } from './types.js';

export function signal<T>(initial: T, options?: SignalOptions<T>): Signal<T> {
  return new SignalImpl(initial, options?.equals ?? Object.is);
}
