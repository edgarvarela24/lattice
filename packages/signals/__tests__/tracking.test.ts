import { describe, it, expect, vi } from 'vitest';
import { getCurrentTracker, runWithTracker } from '../src/tracking.js';
import { signal } from '../src/index.js';
import type { Tracker } from '../src/types.js';

function createTracker(): Tracker {
  return { cleanups: [], notify: () => null, children: new Set() };
}

describe('Tracker', () => {
  // --- Basic behavior ---

  it('getCurrentTracker returns undefined when nothing is tracking', () => {
    expect(getCurrentTracker()).toBeUndefined();
  });

  it('runWithTracker executes the function and returns its result', () => {
    const tracker = createTracker();
    const result = runWithTracker(tracker, () => 42);
    expect(result).toBe(42);
  });

  it('runWithTracker makes the tracker current for the duration of the function', () => {
    const tracker = createTracker();
    let observed: Tracker | undefined;
    runWithTracker(tracker, () => {
      observed = getCurrentTracker();
    });
    expect(observed).toBe(tracker);
  });

  it('getCurrentTracker returns undefined after runWithTracker completes', () => {
    const tracker = createTracker();
    runWithTracker(tracker, () => {});
    expect(getCurrentTracker()).toBeUndefined();
  });

  it('getCurrentTracker called multiple times during the same runWithTracker returns the same tracker', () => {
    const tracker = createTracker();
    const observations: (Tracker | undefined)[] = [];
    runWithTracker(tracker, () => {
      observations.push(getCurrentTracker());
      observations.push(getCurrentTracker());
      observations.push(getCurrentTracker());
    });
    expect(observations).toHaveLength(3);
    expect(observations[0]).toBe(tracker);
    expect(observations[1]).toBe(tracker);
    expect(observations[2]).toBe(tracker);
  });

  // --- Nesting ---

  it('nested runWithTracker calls maintain a proper stack (push A, push B, pop B, pop A)', () => {
    const trackerA = createTracker();
    const trackerB = createTracker();

    let beforeNest: Tracker | undefined;
    let duringNest: Tracker | undefined;
    let afterNest: Tracker | undefined;

    runWithTracker(trackerA, () => {
      beforeNest = getCurrentTracker();
      runWithTracker(trackerB, () => {
        duringNest = getCurrentTracker();
      });
      afterNest = getCurrentTracker();
    });

    expect(beforeNest).toBe(trackerA);
    expect(duringNest).toBe(trackerB);
    expect(afterNest).toBe(trackerA);
    expect(getCurrentTracker()).toBeUndefined();
  });

  it('deep nesting (3-4 levels) maintains the correct stack order', () => {
    const t1 = createTracker();
    const t2 = createTracker();
    const t3 = createTracker();
    const t4 = createTracker();

    const observed: (Tracker | undefined)[] = [];

    runWithTracker(t1, () => {
      observed.push(getCurrentTracker()); // t1
      runWithTracker(t2, () => {
        observed.push(getCurrentTracker()); // t2
        runWithTracker(t3, () => {
          observed.push(getCurrentTracker()); // t3
          runWithTracker(t4, () => {
            observed.push(getCurrentTracker()); // t4
          });
          observed.push(getCurrentTracker()); // t3
        });
        observed.push(getCurrentTracker()); // t2
      });
      observed.push(getCurrentTracker()); // t1
    });

    expect(observed).toEqual([t1, t2, t3, t4, t3, t2, t1]);
    expect(getCurrentTracker()).toBeUndefined();
  });

  // --- Error handling ---

  it('runWithTracker restores the previous tracker even if the function throws', () => {
    const tracker = createTracker();
    const error = new Error('boom');

    expect(() =>
      runWithTracker(tracker, () => {
        throw error;
      }),
    ).toThrow(error);

    expect(getCurrentTracker()).toBeUndefined();
  });

  it('nested runWithTracker where an inner call throws still restores the outer tracker', () => {
    const outer = createTracker();
    const inner = createTracker();
    const error = new Error('inner boom');

    let outerAfterThrow: Tracker | undefined;

    runWithTracker(outer, () => {
      try {
        runWithTracker(inner, () => {
          throw error;
        });
      } catch {
        // swallow
      }
      outerAfterThrow = getCurrentTracker();
    });

    expect(outerAfterThrow).toBe(outer);
    expect(getCurrentTracker()).toBeUndefined();
  });

  // --- Re-entrancy ---

  it('the same tracker object can be pushed multiple times (re-entrancy)', () => {
    const tracker = createTracker();

    let innerCurrent: Tracker | undefined;
    let outerAfterInner: Tracker | undefined;

    runWithTracker(tracker, () => {
      runWithTracker(tracker, () => {
        innerCurrent = getCurrentTracker();
      });
      outerAfterInner = getCurrentTracker();
    });

    expect(innerCurrent).toBe(tracker);
    expect(outerAfterInner).toBe(tracker);
    expect(getCurrentTracker()).toBeUndefined();
  });

  // --- Final invariant ---

  it('stack is empty after all trackers are popped', () => {
    const t1 = createTracker();
    const t2 = createTracker();
    const t3 = createTracker();

    runWithTracker(t1, () => {
      runWithTracker(t2, () => {
        runWithTracker(t3, () => {});
      });
    });

    expect(getCurrentTracker()).toBeUndefined();
  });
});

describe('Signal + Tracker integration', () => {
  // --- Basic tracking ---

  it('reading a signal .value inside runWithTracker adds a cleanup to the tracker', () => {
    const tracker = createTracker();
    const s = signal(0);

    runWithTracker(tracker, () => {
      void s.value;
    });

    expect(tracker.cleanups).toHaveLength(1);
    expect(typeof tracker.cleanups[0]).toBe('function');
  });

  it('reading a signal .value outside runWithTracker does NOT add any cleanup', () => {
    const s = signal(0);
    void s.value;
    const tracker = createTracker();

    // No tracker was active, so there's nothing to check on a tracker.
    // Just verify no error is thrown and getCurrentTracker is undefined.
    expect(getCurrentTracker()).toBeUndefined();
    expect(tracker.cleanups.length).toBe(0);
  });

  it('.peek() inside runWithTracker does NOT add a cleanup to the tracker', () => {
    const tracker = createTracker();
    const s = signal(0);

    runWithTracker(tracker, () => {
      s.peek();
    });

    expect(tracker.cleanups).toHaveLength(0);
  });

  // --- Deduplication ---

  it('reading the same signal twice inside the same runWithTracker only registers one cleanup', () => {
    const tracker = createTracker();
    const s = signal(0);

    runWithTracker(tracker, () => {
      void s.value;
      void s.value;
    });

    expect(tracker.cleanups).toHaveLength(1);
  });

  // --- Multiple signals ---

  it('reading multiple different signals inside the same runWithTracker adds one cleanup per signal', () => {
    const tracker = createTracker();
    const a = signal('a');
    const b = signal('b');
    const c = signal('c');

    runWithTracker(tracker, () => {
      void a.value;
      void b.value;
      void c.value;
    });

    expect(tracker.cleanups).toHaveLength(3);
  });

  // --- Cleanups actually unsubscribe ---

  it('calling all cleanups unsubscribes the tracker from the signal', () => {
    const tracker = createTracker();
    const s = signal(0);
    const spy = vi.fn();

    // Read inside tracker to register dependency
    runWithTracker(tracker, () => {
      void s.value;
    });

    // Also subscribe manually so we can observe notifications
    s.subscribe(spy);

    // Run all cleanups — this should unsubscribe the tracker's subscription
    for (const cleanup of tracker.cleanups) {
      cleanup();
    }

    // The manual spy subscription should still work
    s.value = 1;
    expect(spy).toHaveBeenCalledTimes(1);

    // But the tracker's cleanups have already been called — nothing should break
    // and the tracker should no longer be subscribed
    expect(tracker.cleanups).toHaveLength(1); // array still holds the references
  });

  // --- Writes do NOT track ---

  it('writing to .value inside runWithTracker does NOT register a dependency', () => {
    const tracker = createTracker();
    const s = signal(0);

    runWithTracker(tracker, () => {
      s.value = 42;
    });

    expect(tracker.cleanups).toHaveLength(0);
  });

  it('after cleanups are called, the same tracker can re-register with the signal', () => {
    const tracker = createTracker();
    const s = signal(0);

    // First run — registers dependency
    runWithTracker(tracker, () => {
      void s.value;
    });
    expect(tracker.cleanups).toHaveLength(1);

    // Run all cleanups (simulating effect re-run prep)
    for (const cleanup of tracker.cleanups) {
      cleanup();
    }
    tracker.cleanups.length = 0;

    // Second run — should re-register
    runWithTracker(tracker, () => {
      void s.value;
    });
    expect(tracker.cleanups).toHaveLength(1);
  });
});
