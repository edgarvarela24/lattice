import { Observer, ReactiveSource } from './types.js';

const observerStack: Observer[] = [];
const sourceStack: Map<ReactiveSource, number>[] = [];

let isTracking = true;

export function getCurrentObserver(): Observer | undefined {
  return isTracking ? observerStack.at(-1) : undefined;
}

export function runWithObserver<T>(observer: Observer, fn: () => T): T {
  observerStack.push(observer);

  let returnVal;

  try {
    returnVal = fn();
  } finally {
    observerStack.pop();
  }

  return returnVal;
}

export function untracked<T>(fn: () => T): T {
  const prev = isTracking;
  isTracking = false;
  try {
    return fn();
  } finally {
    isTracking = prev;
  }
}

export function startTrackingSources(): Map<ReactiveSource, number> {
  const deps = new Map<ReactiveSource, number>();
  sourceStack.push(deps);
  return deps;
}

export function stopTrackingSources(): void {
  sourceStack.pop();
}

export function trackSource(source: ReactiveSource): void {
  const s = sourceStack.at(-1);
  if (s && !s.has(source)) {
    s.set(source, source._version);
  }
}
