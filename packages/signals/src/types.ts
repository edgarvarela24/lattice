// types.ts — Public (what consumers see)
export type Signal<T> = {
  value: T;
  peek(): T;
  subscribe(cb: (newValue: T, oldValue: T) => void): () => void;
};

export type ReadonlySignal<T> = {
  readonly value: T;
  peek(): T;
  subscribe(cb: (newValue: T, oldValue: T) => void): () => void;
};

export type Disposable = {
  dispose(): void;
  readonly active: boolean;
};

export type SignalOptions<T> = {
  equals?: (a: T, b: T) => boolean;
};

// internal-types.ts — What the implementation uses
export type Owner = Omit<Disposable, 'active'> & {
  active: boolean;
  cleanups: (() => void)[];
  children: Set<Owner>;
};

export type Observer = Owner & {
  notify: () => void;
};

export type InternalSignal<T> = Signal<T> & {
  readonly _version: number;
};

export type InternalComputed<T> = ReadonlySignal<T> &
  Observer & {
    dirty: boolean;
    _version: number;
  };

export type ReactiveSource = {
  readonly value: unknown;
  readonly _version: number;
};
