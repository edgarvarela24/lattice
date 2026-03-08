import { ComputedImpl } from './computed-impl.js';
import type { ReadonlySignal, SignalOptions } from './types.js';

export function computed<T>(fn: () => T, options?: SignalOptions<T>): ReadonlySignal<T> {
  return new ComputedImpl(fn, options?.equals ?? Object.is);
}
