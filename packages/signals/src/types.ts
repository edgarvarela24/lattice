import type { Prettify } from '@lattice/utils';

export type Signal<T> = Prettify<{
  /** The current value of the signal. */
  value: T;
  /** Read the value without subscribing. */
  peek(): T;
  /** Subscribe to value changes. Returns an unsubscribe function. */
  subscribe(cb: (newValue: T, oldValue: T) => void): () => void;
}>;

export type SignalOptions<T> = Prettify<{
  /** Custom equality function to determine if the value has changed. */
  equals?: (a: T, b: T) => boolean;
}>;

export type Tracker = {
  /** List of cleanup functions to run */
  cleanups: (() => void)[];
  notify: () => void;
};

export type Disposable = {
  dispose(): void;
  active: boolean;
};

export type Effect = Disposable & Tracker;
