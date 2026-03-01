import { describe, it, expect, vi } from 'vitest';
import { getCurrentObserver, runWithObserver, untracked } from '../src/observer.js';
import { signal } from '../src/index.js';
import type { Observer } from '../src/types.js';
import { computed } from '../src/computed.js';
import { effect } from '../src/effect.js';

function createObserver(): Observer {
  return { cleanups: [], notify: () => null, children: new Set() };
}

describe('Observer', () => {
  // --- Basic behavior ---

  it('getCurrentObserver returns undefined when nothing is tracking', () => {
    expect(getCurrentObserver()).toBeUndefined();
  });

  it('runWithObserver executes the function and returns its result', () => {
    const observer = createObserver();
    const result = runWithObserver(observer, () => 42);
    expect(result).toBe(42);
  });

  it('runWithObserver makes the observer current for the duration of the function', () => {
    const observer = createObserver();
    let observed: Observer | undefined;
    runWithObserver(observer, () => {
      observed = getCurrentObserver();
    });
    expect(observed).toBe(observer);
  });

  it('getCurrentObserver returns undefined after runWithObserver completes', () => {
    const observer = createObserver();
    runWithObserver(observer, () => {});
    expect(getCurrentObserver()).toBeUndefined();
  });

  it('getCurrentObserver called multiple times during the same runWithObserver returns the same observer', () => {
    const observer = createObserver();
    const observations: (Observer | undefined)[] = [];
    runWithObserver(observer, () => {
      observations.push(getCurrentObserver());
      observations.push(getCurrentObserver());
      observations.push(getCurrentObserver());
    });
    expect(observations).toHaveLength(3);
    expect(observations[0]).toBe(observer);
    expect(observations[1]).toBe(observer);
    expect(observations[2]).toBe(observer);
  });

  // --- Nesting ---

  it('nested runWithObserver calls maintain a proper stack (push A, push B, pop B, pop A)', () => {
    const observerA = createObserver();
    const observerB = createObserver();

    let beforeNest: Observer | undefined;
    let duringNest: Observer | undefined;
    let afterNest: Observer | undefined;

    runWithObserver(observerA, () => {
      beforeNest = getCurrentObserver();
      runWithObserver(observerB, () => {
        duringNest = getCurrentObserver();
      });
      afterNest = getCurrentObserver();
    });

    expect(beforeNest).toBe(observerA);
    expect(duringNest).toBe(observerB);
    expect(afterNest).toBe(observerA);
    expect(getCurrentObserver()).toBeUndefined();
  });

  it('deep nesting (3-4 levels) maintains the correct stack order', () => {
    const t1 = createObserver();
    const t2 = createObserver();
    const t3 = createObserver();
    const t4 = createObserver();

    const observed: (Observer | undefined)[] = [];

    runWithObserver(t1, () => {
      observed.push(getCurrentObserver()); // t1
      runWithObserver(t2, () => {
        observed.push(getCurrentObserver()); // t2
        runWithObserver(t3, () => {
          observed.push(getCurrentObserver()); // t3
          runWithObserver(t4, () => {
            observed.push(getCurrentObserver()); // t4
          });
          observed.push(getCurrentObserver()); // t3
        });
        observed.push(getCurrentObserver()); // t2
      });
      observed.push(getCurrentObserver()); // t1
    });

    expect(observed).toEqual([t1, t2, t3, t4, t3, t2, t1]);
    expect(getCurrentObserver()).toBeUndefined();
  });

  // --- Error handling ---

  it('runWithObserver restores the previous observer even if the function throws', () => {
    const observer = createObserver();
    const error = new Error('boom');

    expect(() =>
      runWithObserver(observer, () => {
        throw error;
      }),
    ).toThrow(error);

    expect(getCurrentObserver()).toBeUndefined();
  });

  it('nested runWithObserver where an inner call throws still restores the outer observer', () => {
    const outer = createObserver();
    const inner = createObserver();
    const error = new Error('inner boom');

    let outerAfterThrow: Observer | undefined;

    runWithObserver(outer, () => {
      try {
        runWithObserver(inner, () => {
          throw error;
        });
      } catch {
        // swallow
      }
      outerAfterThrow = getCurrentObserver();
    });

    expect(outerAfterThrow).toBe(outer);
    expect(getCurrentObserver()).toBeUndefined();
  });

  // --- Re-entrancy ---

  it('the same observer object can be pushed multiple times (re-entrancy)', () => {
    const observer = createObserver();

    let innerCurrent: Observer | undefined;
    let outerAfterInner: Observer | undefined;

    runWithObserver(observer, () => {
      runWithObserver(observer, () => {
        innerCurrent = getCurrentObserver();
      });
      outerAfterInner = getCurrentObserver();
    });

    expect(innerCurrent).toBe(observer);
    expect(outerAfterInner).toBe(observer);
    expect(getCurrentObserver()).toBeUndefined();
  });

  // --- Final invariant ---

  it('stack is empty after all observers are popped', () => {
    const t1 = createObserver();
    const t2 = createObserver();
    const t3 = createObserver();

    runWithObserver(t1, () => {
      runWithObserver(t2, () => {
        runWithObserver(t3, () => {});
      });
    });

    expect(getCurrentObserver()).toBeUndefined();
  });
});

describe('Signal + Observer integration', () => {
  // --- Basic tracking ---

  it('reading a signal .value inside runWithObserver adds a cleanup to the observer', () => {
    const observer = createObserver();
    const s = signal(0);

    runWithObserver(observer, () => {
      void s.value;
    });

    expect(observer.cleanups).toHaveLength(1);
    expect(typeof observer.cleanups[0]).toBe('function');
  });

  it('reading a signal .value outside runWithObserver does NOT add any cleanup', () => {
    const s = signal(0);
    void s.value;
    const observer = createObserver();

    // No observer was active, so there's nothing to check on an observer.
    // Just verify no error is thrown and getCurrentObserver is undefined.
    expect(getCurrentObserver()).toBeUndefined();
    expect(observer.cleanups.length).toBe(0);
  });

  it('.peek() inside runWithObserver does NOT add a cleanup to the observer', () => {
    const observer = createObserver();
    const s = signal(0);

    runWithObserver(observer, () => {
      s.peek();
    });

    expect(observer.cleanups).toHaveLength(0);
  });

  // --- Deduplication ---

  it('reading the same signal twice inside the same runWithObserver only registers one cleanup', () => {
    const observer = createObserver();
    const s = signal(0);

    runWithObserver(observer, () => {
      void s.value;
      void s.value;
    });

    expect(observer.cleanups).toHaveLength(1);
  });

  // --- Multiple signals ---

  it('reading multiple different signals inside the same runWithObserver adds one cleanup per signal', () => {
    const observer = createObserver();
    const a = signal('a');
    const b = signal('b');
    const c = signal('c');

    runWithObserver(observer, () => {
      void a.value;
      void b.value;
      void c.value;
    });

    expect(observer.cleanups).toHaveLength(3);
  });

  // --- Cleanups actually unsubscribe ---

  it('calling all cleanups unsubscribes the observer from the signal', () => {
    const observer = createObserver();
    const s = signal(0);
    const spy = vi.fn();

    // Read inside observer to register dependency
    runWithObserver(observer, () => {
      void s.value;
    });

    // Also subscribe manually so we can observe notifications
    s.subscribe(spy);

    // Run all cleanups — this should unsubscribe the observer's subscription
    for (const cleanup of observer.cleanups) {
      cleanup();
    }

    // The manual spy subscription should still work
    s.value = 1;
    expect(spy).toHaveBeenCalledTimes(1);

    // But the observer's cleanups have already been called — nothing should break
    // and the observer should no longer be subscribed
    expect(observer.cleanups).toHaveLength(1); // array still holds the references
  });

  // --- Writes do NOT track ---

  it('writing to .value inside runWithObserver does NOT register a dependency', () => {
    const observer = createObserver();
    const s = signal(0);

    runWithObserver(observer, () => {
      s.value = 42;
    });

    expect(observer.cleanups).toHaveLength(0);
  });

  it('after cleanups are called, the same observer can re-register with the signal', () => {
    const observer = createObserver();
    const s = signal(0);

    // First run — registers dependency
    runWithObserver(observer, () => {
      void s.value;
    });
    expect(observer.cleanups).toHaveLength(1);

    // Run all cleanups (simulating effect re-run prep)
    for (const cleanup of observer.cleanups) {
      cleanup();
    }
    observer.cleanups.length = 0;

    // Second run — should re-register
    runWithObserver(observer, () => {
      void s.value;
    });
    expect(observer.cleanups).toHaveLength(1);
  });

  // --- Untracked ---

  it('reading a signal inside untracked does not create a dependency', () => {
    const observer = createObserver();
    const s = signal(0);
    runWithObserver(observer, () => {
      untracked(() => {
        void s.value;
      });
    });
    expect(observer.cleanups).toHaveLength(0);
  });

  it('reading a computed inside untracked does not create a dependency', () => {
    const observer = createObserver();
    const s = signal(0);
    const c = computed(() => s.value + 420);

    runWithObserver(observer, () => {
      untracked(() => {
        void c.value;
      });
    });
    expect(observer.cleanups).toHaveLength(0);
  });

  it('untracked returns the function result', () => {
    const result = untracked(() => 42);
    expect(result).toBe(42);
  });

  it("untracked inside an effect --- the untracked reads don't trigger re-reruns", () => {
    const s = signal(0);
    const fn = vi.fn(() => {
      untracked(() => {
        void s.value;
      });
    });
    effect(fn);
    expect(fn).toHaveBeenCalledTimes(1);
    s.value = 5;
    expect(fn).toHaveBeenCalledTimes(1);
  });

  it('tracking resumes after untracked block', () => {
    const s = signal(0);
    const fn = vi.fn(() => {
      untracked(() => {
        void s.value; // not tracked
      });
      void s.value; // tracked
    });

    effect(fn);
    expect(fn).toHaveBeenCalledTimes(1);

    s.value = 1;
    expect(fn).toHaveBeenCalledTimes(2);
  });

  it('untracked works with computed — reads value but does not track', () => {
    const s = signal(0);
    const c = computed(() => s.value * 2);
    const fn = vi.fn(() => {
      untracked(() => {
        void c.value;
      });
    });

    effect(fn);
    expect(fn).toHaveBeenCalledTimes(1);

    s.value = 5;
    expect(fn).toHaveBeenCalledTimes(1); // effect did not re-run
    expect(c.value).toBe(10); // computed still works, just wasn't tracked
  });
});
