import { describe, it, expect, vi } from 'vitest';
import { signal } from '../src/index.js';
import { effect } from '../src/effect.js';

describe('effect', () => {
  // --- Basic execution ---

  it('runs the function immediately on creation', () => {
    const fn = vi.fn();
    effect(fn);
    expect(fn).toHaveBeenCalledTimes(1);
  });

  it('returns a Disposable with active set to true', () => {
    const disposable = effect(() => {});
    expect(disposable.active).toBe(true);
  });

  // --- Reactive re-runs ---

  it('re-runs when a signal it read changes', () => {
    const s = signal(0);
    const fn = vi.fn(() => {
      void s.value;
    });

    effect(fn);
    expect(fn).toHaveBeenCalledTimes(1);

    s.value = 1;
    expect(fn).toHaveBeenCalledTimes(2);
  });

  it('does not re-run when an unrelated signal changes', () => {
    const tracked = signal(0);
    const unrelated = signal(0);
    const fn = vi.fn(() => {
      void tracked.value;
    });

    effect(fn);
    expect(fn).toHaveBeenCalledTimes(1);

    unrelated.value = 1;
    expect(fn).toHaveBeenCalledTimes(1);
  });

  it('re-runs on each change to a tracked signal', () => {
    const s = signal(0);
    const fn = vi.fn(() => {
      void s.value;
    });

    effect(fn);
    expect(fn).toHaveBeenCalledTimes(1);

    s.value = 1;
    s.value = 2;
    s.value = 3;
    expect(fn).toHaveBeenCalledTimes(4);
  });

  it('tracks multiple signals and re-runs when any of them change', () => {
    const a = signal('a');
    const b = signal('b');
    const fn = vi.fn(() => {
      void a.value;
      void b.value;
    });

    effect(fn);
    expect(fn).toHaveBeenCalledTimes(1);

    a.value = 'a2';
    expect(fn).toHaveBeenCalledTimes(2);

    b.value = 'b2';
    expect(fn).toHaveBeenCalledTimes(3);
  });

  it('reads the new value when re-running (not a stale value)', () => {
    const s = signal(0);
    const observed: number[] = [];

    effect(() => {
      observed.push(s.value);
    });

    expect(observed).toEqual([0]);

    s.value = 10;
    expect(observed).toEqual([0, 10]);

    s.value = 20;
    expect(observed).toEqual([0, 10, 20]);
  });

  // --- Conditional / dynamic dependencies ---

  it('re-tracks dependencies on each run (conditional dependencies)', () => {
    const condition = signal(true);
    const a = signal('a');
    const b = signal('b');
    const fn = vi.fn(() => {
      if (condition.value) {
        void a.value;
      } else {
        void b.value;
      }
    });

    effect(fn);
    expect(fn).toHaveBeenCalledTimes(1);

    // a is tracked, b is not
    a.value = 'a2';
    expect(fn).toHaveBeenCalledTimes(2);

    b.value = 'b2';
    expect(fn).toHaveBeenCalledTimes(2); // b not tracked

    // flip condition — now b is tracked, a is not
    condition.value = false;
    expect(fn).toHaveBeenCalledTimes(3);

    b.value = 'b3';
    expect(fn).toHaveBeenCalledTimes(4);

    a.value = 'a3';
    expect(fn).toHaveBeenCalledTimes(4); // a no longer tracked
  });

  it('correctly cleans up old dependencies when dependencies change between runs', () => {
    const toggle = signal(true);
    const dep1 = signal(0);
    const dep2 = signal(0);
    const fn = vi.fn(() => {
      void toggle.value;
      if (toggle.peek()) {
        void dep1.value;
      } else {
        void dep2.value;
      }
    });

    effect(fn);
    expect(fn).toHaveBeenCalledTimes(1);

    // dep1 is tracked
    dep1.value = 1;
    expect(fn).toHaveBeenCalledTimes(2);

    // switch deps
    toggle.value = false;
    expect(fn).toHaveBeenCalledTimes(3);

    // dep1 should no longer trigger re-run
    dep1.value = 2;
    expect(fn).toHaveBeenCalledTimes(3);

    // dep2 should now trigger re-run
    dep2.value = 1;
    expect(fn).toHaveBeenCalledTimes(4);
  });

  // --- .peek() does not track ---

  it('does not track signals read via .peek()', () => {
    const s = signal(0);
    const fn = vi.fn(() => {
      s.peek();
    });

    effect(fn);
    expect(fn).toHaveBeenCalledTimes(1);

    s.value = 1;
    expect(fn).toHaveBeenCalledTimes(1);
  });

  // --- Equality check ---

  it('does not re-run when a signal is set to the same value', () => {
    const s = signal(5);
    const fn = vi.fn(() => {
      void s.value;
    });

    effect(fn);
    expect(fn).toHaveBeenCalledTimes(1);

    s.value = 5;
    expect(fn).toHaveBeenCalledTimes(1);
  });

  // --- Disposal ---

  it('does not re-run after dispose() is called', () => {
    const s = signal(0);
    const fn = vi.fn(() => {
      void s.value;
    });

    const disposable = effect(fn);
    expect(fn).toHaveBeenCalledTimes(1);

    disposable.dispose();

    s.value = 1;
    expect(fn).toHaveBeenCalledTimes(1);
  });

  it('active is false after dispose() is called', () => {
    const disposable = effect(() => {});
    expect(disposable.active).toBe(true);

    disposable.dispose();
    expect(disposable.active).toBe(false);
  });

  it('dispose() called twice is a no-op (no error)', () => {
    const s = signal(0);
    const fn = vi.fn(() => {
      void s.value;
    });

    const disposable = effect(fn);
    disposable.dispose();
    disposable.dispose();

    expect(disposable.active).toBe(false);

    s.value = 1;
    expect(fn).toHaveBeenCalledTimes(1);
  });

  // --- Nested effects ---

  it('nested effects run independently', () => {
    const a = signal(0);
    const b = signal(0);
    const outerFn = vi.fn();
    const innerFn = vi.fn();

    effect(() => {
      void a.value;
      outerFn();

      // Create an inner effect on the first run only
      if (a.peek() === 0) {
        effect(() => {
          void b.value;
          innerFn();
        });
      }
    });

    expect(outerFn).toHaveBeenCalledTimes(1);
    expect(innerFn).toHaveBeenCalledTimes(1);

    // Changing b should only trigger the inner effect
    b.value = 1;
    expect(outerFn).toHaveBeenCalledTimes(1);
    expect(innerFn).toHaveBeenCalledTimes(2);

    // Changing a should only trigger the outer effect
    a.value = 1;
    expect(outerFn).toHaveBeenCalledTimes(2);
    expect(innerFn).toHaveBeenCalledTimes(2);
  });
});
