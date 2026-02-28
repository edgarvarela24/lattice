import { Observer } from './types.js';

const observerStack: Observer[] = [];
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
