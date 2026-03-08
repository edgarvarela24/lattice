import { Observer, ReactiveSource } from './types.js';

const observerStack: Observer[] = [];
const dependencyStack: Map<ReactiveSource, number>[] = [];

let isTracking = true;

export function getCurrentObserver(): Observer | undefined {
  return isTracking ? observerStack.at(-1) : undefined;
}

export function runWithObserver<T>(observer: Observer, fn: () => T): T {
  // Make observer current for duration of function
  observerStack.push(observer);

  // Execute fn in try/finally to restore previous observer even if fn throws error
  let returnVal;

  try {
    returnVal = fn();
  } catch (error) {
    throw error;
  } finally {
    // Remove as current observer
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

export function startTrackingDependents(): Map<ReactiveSource, number> {
  const deps = new Map<ReactiveSource, number>();
  dependencyStack.push(deps);
  return deps;
}

export function stopTrackingDependents(): void {
  dependencyStack.pop();
}

export function trackDependency(source: ReactiveSource): void {
  const dependency = dependencyStack.at(-1);
  if (dependency && !dependency.has(source)) {
    dependency.set(source, source._version);
  }
}
