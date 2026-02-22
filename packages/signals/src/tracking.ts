import { Tracker } from '../src/types.js';

const trackers: Tracker[] = [];

export function getCurrentTracker(): Tracker | undefined {
  return trackers.at(-1);
}

export function runWithTracker<T>(tracker: Tracker, fn: () => T): T {
  // Make tracker current for duration of function
  trackers.push(tracker);

  // Execute fn in try/finally to restore previous tracker even if fn throws error
  let returnVal;

  try {
    returnVal = fn();
  } finally {
    // Remove as current tracker
    trackers.pop();
  }

  return returnVal;
}
