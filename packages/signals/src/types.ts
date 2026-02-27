import type { Prettify } from '@lattice/utils';

export type ReadonlySignal<T> = {
  readonly value: T;
  peek(): T;
  subscribe(cb: (newValue: T, oldValue: T) => void): () => void;
};

export type Signal<T> = Omit<ReadonlySignal<T>, 'value'> & {
  value: T;
};

export type Computed<T> = ReadonlySignal<T> & Tracker & { dirty: boolean };

export type SignalOptions<T> = Prettify<{
  /** Custom equality function to determine if the value has changed. */
  equals?: (a: T, b: T) => boolean;
}>;

export type Tracker = {
  /** List of cleanup functions to run */
  cleanups: (() => void)[];
  notify: () => void;
  children: Set<Effect>;
};

export type Disposable = {
  dispose(): void;
  active: boolean;
};

export type Effect = Disposable & Tracker;
