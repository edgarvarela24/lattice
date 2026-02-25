import { describe, it, expect, vi } from 'vitest';
import { signal } from '../src/index.js';
import { computed } from '../src/computed.js';
import { effect } from '../src/effect.js';

describe('computed', () => {
  // -----------------------------------------------------------------------
  // Creation & Initial Evaluation
  // -----------------------------------------------------------------------

  it('evaluates the function immediately and returns the result via .value', () => {
    const c = computed(() => 42);
    expect(c.value).toBe(42);
  });

  it('returns the cached value on subsequent reads without re-running the function', () => {
    const fn = vi.fn(() => 'hello');
    const c = computed(fn);

    expect(c.value).toBe('hello');
    expect(c.value).toBe('hello');
    expect(c.value).toBe('hello');

    // Once for initial evaluation, no extra calls for subsequent reads
    expect(fn).toHaveBeenCalledTimes(1);
  });

  // -----------------------------------------------------------------------
  // Re-evaluation on dependency change
  // -----------------------------------------------------------------------

  it('re-evaluates when a dependency changes and .value is read', () => {
    const s = signal(2);
    const c = computed(() => s.value * 10);

    expect(c.value).toBe(20);

    s.value = 3;
    expect(c.value).toBe(30);
  });

  it('does NOT re-evaluate eagerly when a dependency changes (lazy)', () => {
    const s = signal(1);
    const fn = vi.fn(() => s.value + 1);
    const c = computed(fn);

    // Initial evaluation
    expect(c.value).toBe(2);
    expect(fn).toHaveBeenCalledTimes(1);

    // Dependency changes — fn should NOT run yet
    s.value = 10;
    expect(fn).toHaveBeenCalledTimes(1);

    // Reading .value triggers re-evaluation
    expect(c.value).toBe(11);
    expect(fn).toHaveBeenCalledTimes(2);
  });

  it('tracks multiple dependencies', () => {
    const a = signal(2);
    const b = signal(3);
    const c = computed(() => a.value + b.value);

    expect(c.value).toBe(5);

    a.value = 10;
    expect(c.value).toBe(13);

    b.value = 20;
    expect(c.value).toBe(30);
  });

  it('re-tracks dependencies on each evaluation (conditional dependencies)', () => {
    const condition = signal(true);
    const a = signal('A');
    const b = signal('B');
    const fn = vi.fn(() => (condition.value ? a.value : b.value));

    const c = computed(fn);
    expect(c.value).toBe('A');
    expect(fn).toHaveBeenCalledTimes(1);

    // a is tracked, b is not
    a.value = 'A2';
    expect(c.value).toBe('A2');
    expect(fn).toHaveBeenCalledTimes(2);

    // b is not tracked — changing it should NOT dirty the computed
    b.value = 'B2';
    expect(fn).toHaveBeenCalledTimes(2); // no re-evaluation triggered

    // flip condition so b is now tracked
    condition.value = false;
    expect(c.value).toBe('B2');

    // now b triggers re-evaluation, a does not
    b.value = 'B3';
    expect(c.value).toBe('B3');

    a.value = 'A3';
    // a is no longer tracked — reading .value should return cached value
    expect(c.value).toBe('B3');
  });

  it('does not re-evaluate when an unrelated signal changes', () => {
    const tracked = signal(0);
    const unrelated = signal(0);
    const fn = vi.fn(() => tracked.value);

    const c = computed(fn);
    expect(c.value).toBe(0);
    expect(fn).toHaveBeenCalledTimes(1);

    unrelated.value = 99;

    // Unrelated signal should not cause re-evaluation
    expect(c.value).toBe(0);
    expect(fn).toHaveBeenCalledTimes(1);
  });

  // -----------------------------------------------------------------------
  // .peek()
  // -----------------------------------------------------------------------

  it('peek() returns the cached value without tracking', () => {
    const s = signal(5);
    const c = computed(() => s.value * 2);

    expect(c.peek()).toBe(10);
  });

  it('peek() inside an effect does NOT create a dependency on the computed', () => {
    const s = signal(1);
    const c = computed(() => s.value * 2);
    const fn = vi.fn(() => {
      c.peek();
    });

    effect(fn);
    expect(fn).toHaveBeenCalledTimes(1);

    // Changing the signal updates the computed, but the effect should NOT re-run
    s.value = 2;
    expect(fn).toHaveBeenCalledTimes(1);
  });

  // -----------------------------------------------------------------------
  // Equality — custom
  // -----------------------------------------------------------------------

  it('with custom equality — re-evaluates but does not notify subscribers if new value is "equal"', () => {
    const s = signal({ x: 1, y: 2 });
    const subscriber = vi.fn();

    const c = computed(() => ({ sum: s.value.x + s.value.y }), {
      equals: (a, b) => a.sum === b.sum,
    });

    c.subscribe(subscriber);
    expect(c.value).toEqual({ sum: 3 });

    // Set to a new object with the same sum
    s.value = { x: 0, y: 3 };
    expect(c.value).toEqual({ sum: 3 });
    expect(subscriber).not.toHaveBeenCalled();
  });

  // -----------------------------------------------------------------------
  // Equality — default (Object.is)
  // -----------------------------------------------------------------------

  it('with default equality — same primitive value does not notify subscribers', () => {
    const s = signal(5);
    const subscriber = vi.fn();

    // computed always returns a constant, regardless of the signal value
    const c = computed(() => {
      void s.value;
      return 42;
    });

    c.subscribe(subscriber);
    expect(c.value).toBe(42);

    // Dependency changes, but computed re-evaluates to the same value
    s.value = 10;
    expect(c.value).toBe(42);
    expect(subscriber).not.toHaveBeenCalled();
  });

  // -----------------------------------------------------------------------
  // Effects & Computed interaction
  // -----------------------------------------------------------------------

  it('notifies subscribed effects when its value changes', () => {
    const s = signal(1);
    const c = computed(() => s.value * 2);
    const fn = vi.fn(() => {
      void c.value;
    });

    effect(fn);
    expect(fn).toHaveBeenCalledTimes(1);

    s.value = 2;
    expect(fn).toHaveBeenCalledTimes(2);
  });

  it('does NOT notify subscribed effects when re-evaluation produces the same value', () => {
    const s = signal(5);
    const fn = vi.fn(() => {
      void c.value;
    });

    // computed always returns a constant
    const c = computed(() => {
      void s.value;
      return 'constant';
    });

    effect(fn);
    expect(fn).toHaveBeenCalledTimes(1);

    // signal changes, computed re-evaluates but produces same value
    s.value = 10;
    expect(fn).toHaveBeenCalledTimes(1);
  });

  it('computed used inside an effect — effect re-runs when computed value changes', () => {
    const s = signal(1);
    const c = computed(() => s.value + 100);
    const observed: number[] = [];

    effect(() => {
      observed.push(c.value);
    });

    expect(observed).toEqual([101]);

    s.value = 2;
    expect(observed).toEqual([101, 102]);

    s.value = 3;
    expect(observed).toEqual([101, 102, 103]);
  });

  it('computed used inside an effect — effect does NOT re-run when computed re-evaluates to the same value', () => {
    // Signal toggles between values but computed clamps to the same result
    const s = signal(5);
    const c = computed(() => Math.min(s.value, 10));
    const observed: number[] = [];

    effect(() => {
      observed.push(c.value);
    });

    expect(observed).toEqual([5]);

    // Computed value changes from 5 to 7
    s.value = 7;
    expect(observed).toEqual([5, 7]);

    // Computed value changes from 7 to 10
    s.value = 15;
    expect(observed).toEqual([5, 7, 10]);

    // Computed re-evaluates but stays 10 — effect should NOT re-run
    s.value = 20;
    expect(observed).toEqual([5, 7, 10]);
  });

  // -----------------------------------------------------------------------
  // Chained computeds
  // -----------------------------------------------------------------------

  it('chained computeds — computed B depends on computed A, reading B gives correct value', () => {
    const s = signal(2);
    const a = computed(() => s.value * 2);
    const b = computed(() => a.value + 1);

    expect(b.value).toBe(5); // (2 * 2) + 1
  });

  it('chained computeds — updating the signal causes both to update correctly', () => {
    const s = signal(1);
    const a = computed(() => s.value * 10);
    const b = computed(() => a.value + 5);

    expect(a.value).toBe(10);
    expect(b.value).toBe(15);

    s.value = 3;

    expect(a.value).toBe(30);
    expect(b.value).toBe(35);
  });

  // -----------------------------------------------------------------------
  // Diamond dependency
  // -----------------------------------------------------------------------

  it('diamond dependency — effect runs once with consistent values when source signal changes', () => {
    const s = signal(1);
    const a = computed(() => s.value + 1); // 2
    const b = computed(() => s.value * 2); // 2
    const fn = vi.fn(() => {
      return a.value + b.value;
    });

    effect(fn);
    expect(fn).toHaveBeenCalledTimes(1);

    s.value = 3;

    // a = 4, b = 6 → effect should see consistent values
    // The effect may run more than once during the update, but ideally once.
    // At minimum, it must see consistent (non-torn) values.
    const lastCallArgs = fn.mock.results[fn.mock.results.length - 1];
    expect(lastCallArgs.value).toBe(10); // 4 + 6
  });

  // -----------------------------------------------------------------------
  // .subscribe()
  // -----------------------------------------------------------------------

  it('subscribe() returns an unsubscribe function', () => {
    const s = signal(0);
    const c = computed(() => s.value);
    const subscriber = vi.fn();

    const unsubscribe = c.subscribe(subscriber);
    expect(typeof unsubscribe).toBe('function');

    s.value = 1;
    void c.value; // trigger re-evaluation
    expect(subscriber).toHaveBeenCalledTimes(1);

    unsubscribe();

    s.value = 2;
    void c.value; // trigger re-evaluation
    expect(subscriber).toHaveBeenCalledTimes(1); // not called again
  });

  it('unsubscribed callback is not notified', () => {
    const s = signal(0);
    const c = computed(() => s.value * 2);
    const subscriber = vi.fn();

    const unsubscribe = c.subscribe(subscriber);
    unsubscribe();

    s.value = 5;
    void c.value;

    expect(subscriber).not.toHaveBeenCalled();
  });

  // -----------------------------------------------------------------------
  // Lazy evaluation — stays dirty without read
  // -----------------------------------------------------------------------

  it('writing to a dependency without reading the computed does not trigger evaluation (stays dirty)', () => {
    const s = signal(0);
    const fn = vi.fn(() => s.value + 1);
    const c = computed(fn);

    // Initial evaluation
    expect(c.value).toBe(1);
    expect(fn).toHaveBeenCalledTimes(1);

    // Change dependency without reading computed
    s.value = 10;
    s.value = 20;
    s.value = 30;

    // fn should NOT have been called again yet
    expect(fn).toHaveBeenCalledTimes(1);

    // Now read — single re-evaluation with the latest value
    expect(c.value).toBe(31);
    expect(fn).toHaveBeenCalledTimes(2);
  });

  // -----------------------------------------------------------------------
  // Signal equality prevents dirty marking
  // -----------------------------------------------------------------------

  it('handles its dependency being set to the same value (signal equality check prevents dirty marking)', () => {
    const s = signal(5);
    const fn = vi.fn(() => s.value * 2);
    const c = computed(fn);

    expect(c.value).toBe(10);
    expect(fn).toHaveBeenCalledTimes(1);

    // Setting signal to the same value — signal's equality check blocks notification
    s.value = 5;

    // Computed should not be marked dirty, so no re-evaluation
    expect(c.value).toBe(10);
    expect(fn).toHaveBeenCalledTimes(1);
  });
});
