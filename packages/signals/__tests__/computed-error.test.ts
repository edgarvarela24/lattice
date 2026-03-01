import { describe, it, expect, vi } from 'vitest';
import { signal } from '../src/index.js';
import { computed } from '../src/computed.js';
import { effect } from '../src/effect.js';

describe('computed — error handling', () => {
  // -----------------------------------------------------------------------
  // 1. Throw on initial evaluation → cache the error
  // -----------------------------------------------------------------------

  it('throws when the compute function throws on initial evaluation', () => {
    const err = new Error('boom');
    const c = computed(() => {
      throw err;
    });

    expect(() => c.value).toThrow(err);
  });

  it('re-throws the SAME cached error on subsequent reads without re-running fn', () => {
    const err = new Error('boom');
    const fn = vi.fn(() => {
      throw err;
    });
    const c = computed(fn);

    // First read — fn runs, throws, error is cached
    expect(() => c.value).toThrow(err);
    expect(fn).toHaveBeenCalledTimes(1);

    // Second read — same error re-thrown, fn does NOT run again
    expect(() => c.value).toThrow(err);
    expect(fn).toHaveBeenCalledTimes(1);

    // Third read — still cached
    expect(() => c.value).toThrow(err);
    expect(fn).toHaveBeenCalledTimes(1);
  });

  // -----------------------------------------------------------------------
  // 2. Throw after a successful evaluation (dependency change causes error)
  // -----------------------------------------------------------------------

  it('caches error when a dependency change causes fn to throw', () => {
    const s = signal(10);
    const fn = vi.fn(() => {
      if (s.value < 0) throw new Error('negative');
      return s.value * 2;
    });
    const c = computed(fn);

    // Initially works fine
    expect(c.value).toBe(20);

    // Dependency changes to a value that causes an error
    s.value = -1;
    expect(() => c.value).toThrow('negative');

    // Subsequent read — re-throws cached error without re-running fn
    const callCount = fn.mock.calls.length;
    expect(() => c.value).toThrow('negative');
    expect(fn).toHaveBeenCalledTimes(callCount); // no additional call
  });

  // -----------------------------------------------------------------------
  // 3. Clear error on dependency change → recovery
  // -----------------------------------------------------------------------

  it('clears cached error when a dependency changes, allowing recovery', () => {
    const s = signal(-1);
    const c = computed(() => {
      if (s.value < 0) throw new Error('negative');
      return s.value * 2;
    });

    // Initial — throws
    expect(() => c.value).toThrow('negative');

    // Dependency changes to a valid value — error should be cleared, fn re-runs
    s.value = 5;
    expect(c.value).toBe(10);
  });

  it('can oscillate between error and success states', () => {
    const s = signal(1);
    const c = computed(() => {
      if (s.value === 0) throw new Error('division by zero');
      return 100 / s.value;
    });

    expect(c.value).toBe(100);

    // Trigger error
    s.value = 0;
    expect(() => c.value).toThrow('division by zero');

    // Recover
    s.value = 4;
    expect(c.value).toBe(25);

    // Error again
    s.value = 0;
    expect(() => c.value).toThrow('division by zero');

    // Recover again
    s.value = 2;
    expect(c.value).toBe(50);
  });

  // -----------------------------------------------------------------------
  // 4. peek() behavior with errors
  // -----------------------------------------------------------------------

  it('peek() returns the last successful value when an error is cached (does not throw)', () => {
    const s = signal(5);
    const c = computed(() => {
      if (s.value < 0) throw new Error('negative');
      return s.value;
    });

    expect(c.value).toBe(5);

    s.value = -1;
    // .value throws
    expect(() => c.value).toThrow('negative');

    // peek() returns the last good value — it does not throw
    expect(c.peek()).toBe(5);
  });

  it('peek() returns undefined when the computed has never succeeded', () => {
    const c = computed(() => {
      throw new Error('always fails');
    });

    // Initial evaluation throws — peek should return undefined (no prior value)
    expect(() => c.value).toThrow('always fails');
    expect(c.peek()).toBeUndefined();
  });

  // -----------------------------------------------------------------------
  // 5. Error interaction with effects
  // -----------------------------------------------------------------------

  it('error in computed propagates to a reading effect', () => {
    const s = signal(1);
    const c = computed(() => {
      if (s.value < 0) throw new Error('negative');
      return s.value;
    });

    const observed: number[] = [];
    const errors: Error[] = [];

    effect(() => {
      try {
        observed.push(c.value);
      } catch (e) {
        errors.push(e as Error);
      }
    });

    expect(observed).toEqual([1]);
    expect(errors).toEqual([]);

    // Trigger error — effect should re-run and catch the error
    s.value = -1;
    expect(errors.length).toBe(1);
    expect(errors[0].message).toBe('negative');

    // Recovery — effect should re-run with the new valid value
    s.value = 42;
    expect(observed).toEqual([1, 42]);
  });

  // -----------------------------------------------------------------------
  // 6. Error interaction with subscribers (.subscribe)
  // -----------------------------------------------------------------------

  it('subscriber is NOT called when computed transitions to an error state', () => {
    const s = signal(1);
    const c = computed(() => {
      if (s.value < 0) throw new Error('negative');
      return s.value;
    });

    const subscriber = vi.fn();
    c.subscribe(subscriber);

    expect(c.value).toBe(1);

    // Transition to error — subscriber should NOT be called (there's no new *value*)
    s.value = -1;
    expect(subscriber).not.toHaveBeenCalled();
  });

  it('subscriber IS called when computed recovers from error to a new value', () => {
    const s = signal(1);
    const c = computed(() => {
      if (s.value < 0) throw new Error('negative');
      return s.value;
    });

    const subscriber = vi.fn();
    c.subscribe(subscriber);

    expect(c.value).toBe(1);

    // Go to error
    s.value = -1;

    // Recover to a new value — subscriber should fire with (newValue, lastGoodValue)
    s.value = 99;
    void c.value; // trigger evaluation
    expect(subscriber).toHaveBeenCalledWith(99, 1);
  });

  // -----------------------------------------------------------------------
  // 7. Chained computed — error propagation
  // -----------------------------------------------------------------------

  it('error in upstream computed propagates through a downstream computed', () => {
    const s = signal(5);
    const a = computed(() => {
      if (s.value < 0) throw new Error('upstream error');
      return s.value;
    });
    const b = computed(() => a.value * 2);

    expect(b.value).toBe(10);

    s.value = -1;
    // b reads a, which throws — the error should propagate through b
    expect(() => b.value).toThrow('upstream error');

    // Recovery in upstream should recover downstream
    s.value = 3;
    expect(b.value).toBe(6);
  });

  // -----------------------------------------------------------------------
  // 8. Error does not re-run fn on notify if still in error state
  // -----------------------------------------------------------------------

  it('does not re-evaluate eagerly while error is cached and there are no dependents', () => {
    const s = signal(-1);
    const fn = vi.fn(() => {
      if (s.value < 0) throw new Error('negative');
      return s.value;
    });
    const c = computed(fn);

    // Initial — throws
    expect(() => c.value).toThrow('negative');
    expect(fn).toHaveBeenCalledTimes(1);

    // Dependency changes (still negative) — fn should NOT re-run yet (lazy)
    s.value = -2;
    expect(fn).toHaveBeenCalledTimes(1);

    // Read — now fn re-runs (and throws again with updated error)
    expect(() => c.value).toThrow('negative');
    expect(fn).toHaveBeenCalledTimes(2);
  });

  // -----------------------------------------------------------------------
  // 9. Error with custom equality — equality check is skipped when error is thrown
  // -----------------------------------------------------------------------

  it('custom equality function is not called when fn throws', () => {
    const s = signal(1);
    const equalsFn = vi.fn((a: number, b: number) => a === b);

    const c = computed(
      () => {
        if (s.value < 0) throw new Error('negative');
        return s.value;
      },
      { equals: equalsFn },
    );

    expect(c.value).toBe(1);
    equalsFn.mockClear();

    // Transition to error — equals should NOT be called (there's no valid new value)
    s.value = -1;
    expect(() => c.value).toThrow('negative');
    expect(equalsFn).not.toHaveBeenCalled();
  });

  // -----------------------------------------------------------------------
  // 10. The cached error is the exact same object (identity)
  // -----------------------------------------------------------------------

  it('re-throws the exact same error object (referential identity)', () => {
    const err = new Error('unique');
    const c = computed(() => {
      throw err;
    });

    let caught1: unknown;
    let caught2: unknown;

    try {
      c.value;
    } catch (e) {
      caught1 = e;
    }

    try {
      c.value;
    } catch (e) {
      caught2 = e;
    }

    expect(caught1).toBe(err);
    expect(caught2).toBe(err);
    expect(caught1).toBe(caught2);
  });
});
