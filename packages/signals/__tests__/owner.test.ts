import { describe, it, expect, vi } from 'vitest';
import { signal } from '../src/index.js';
import { effect } from '../src/effect.js';
import { computed } from '../src/computed.js';
import { createOwner, runWithOwner } from '../src/owner.js';

describe('ownership', () => {
  // -----------------------------------------------------------------------
  // createOwner basics
  // -----------------------------------------------------------------------

  it('createOwner returns an object with dispose', () => {
    const owner = createOwner();
    expect(owner).toHaveProperty('dispose');
    expect(typeof owner.dispose).toBe('function');
  });

  it('newly created owner is active', () => {
    const owner = createOwner();
    expect(owner.active).toBe(true);
  });

  it('disposed owner is inactive', () => {
    const owner = createOwner();
    owner.dispose();
    expect(owner.active).toBe(false);
  });

  it('disposing an owner twice is a no-op', () => {
    const owner = createOwner();
    owner.dispose();
    owner.dispose(); // should not throw
    expect(owner.active).toBe(false);
  });

  // -----------------------------------------------------------------------
  // runWithOwner — effect ownership
  // -----------------------------------------------------------------------

  it('effect created inside runWithOwner is owned by that owner', () => {
    const owner = createOwner();
    const s = signal(0);
    const fn = vi.fn();

    runWithOwner(owner, () => {
      effect(() => {
        fn(s.value);
      });
    });

    expect(fn).toHaveBeenCalledTimes(1);

    s.value = 1;
    expect(fn).toHaveBeenCalledTimes(2);

    // Disposing the owner should stop the effect
    owner.dispose();

    s.value = 2;
    expect(fn).toHaveBeenCalledTimes(2); // no additional call
  });

  it('multiple effects inside runWithOwner are all cleaned up on dispose', () => {
    const owner = createOwner();
    const s = signal(0);
    const fn1 = vi.fn();
    const fn2 = vi.fn();
    const fn3 = vi.fn();

    runWithOwner(owner, () => {
      effect(() => fn1(s.value));
      effect(() => fn2(s.value));
      effect(() => fn3(s.value));
    });

    expect(fn1).toHaveBeenCalledTimes(1);
    expect(fn2).toHaveBeenCalledTimes(1);
    expect(fn3).toHaveBeenCalledTimes(1);

    owner.dispose();

    s.value = 1;
    expect(fn1).toHaveBeenCalledTimes(1);
    expect(fn2).toHaveBeenCalledTimes(1);
    expect(fn3).toHaveBeenCalledTimes(1);
  });

  // -----------------------------------------------------------------------
  // runWithOwner — cleanup functions
  // -----------------------------------------------------------------------

  it('effect cleanup functions run when owner is disposed', () => {
    const owner = createOwner();
    const cleanup = vi.fn();

    runWithOwner(owner, () => {
      effect(() => {
        return cleanup;
      });
    });

    expect(cleanup).not.toHaveBeenCalled();
    owner.dispose();
    expect(cleanup).toHaveBeenCalledTimes(1);
  });

  // -----------------------------------------------------------------------
  // Nested owners
  // -----------------------------------------------------------------------

  it('disposing a parent owner disposes child owners', () => {
    const parent = createOwner();
    const s = signal(0);
    const fn = vi.fn();

    runWithOwner(parent, () => {
      const child = createOwner();
      runWithOwner(child, () => {
        effect(() => fn(s.value));
      });
    });

    expect(fn).toHaveBeenCalledTimes(1);

    s.value = 1;
    expect(fn).toHaveBeenCalledTimes(2);

    // Disposing parent should cascade to child
    parent.dispose();

    s.value = 2;
    expect(fn).toHaveBeenCalledTimes(2);
  });

  it('disposing a child owner does not affect the parent or siblings', () => {
    const parent = createOwner();
    const s = signal(0);
    const fnA = vi.fn();
    const fnB = vi.fn();
    let childA: ReturnType<typeof createOwner>;

    runWithOwner(parent, () => {
      childA = createOwner();
      const childB = createOwner();

      runWithOwner(childA, () => {
        effect(() => fnA(s.value));
      });

      runWithOwner(childB, () => {
        effect(() => fnB(s.value));
      });
    });

    expect(fnA).toHaveBeenCalledTimes(1);
    expect(fnB).toHaveBeenCalledTimes(1);

    // Dispose only childA
    childA!.dispose();

    s.value = 1;
    expect(fnA).toHaveBeenCalledTimes(1); // stopped
    expect(fnB).toHaveBeenCalledTimes(2); // still running
  });

  it('deeply nested owners dispose recursively', () => {
    const root = createOwner();
    const s = signal(0);
    const fn = vi.fn();

    runWithOwner(root, () => {
      const level1 = createOwner();
      runWithOwner(level1, () => {
        const level2 = createOwner();
        runWithOwner(level2, () => {
          const level3 = createOwner();
          runWithOwner(level3, () => {
            effect(() => fn(s.value));
          });
        });
      });
    });

    expect(fn).toHaveBeenCalledTimes(1);

    s.value = 1;
    expect(fn).toHaveBeenCalledTimes(2);

    root.dispose();

    s.value = 2;
    expect(fn).toHaveBeenCalledTimes(2);
  });

  // -----------------------------------------------------------------------
  // Signals are not owned (they are just values)
  // -----------------------------------------------------------------------

  it('signals created inside an owner still work after owner is disposed', () => {
    const owner = createOwner();
    let s: ReturnType<typeof signal<number>>;

    runWithOwner(owner, () => {
      s = signal(0);
    });

    owner.dispose();

    // Signal itself should still be usable
    s!.value = 5;
    expect(s!.value).toBe(5);
  });

  // -----------------------------------------------------------------------
  // Computeds inside owners
  // -----------------------------------------------------------------------

  it('computed created inside an owner is cleaned up on dispose', () => {
    const owner = createOwner();
    const s = signal(0);
    const fn = vi.fn();
    let c: ReturnType<typeof computed<number>>;

    runWithOwner(owner, () => {
      c = computed(() => s.value * 2);

      // An effect reading the computed — this should be cleaned up
      effect(() => fn(c.value));
    });

    expect(fn).toHaveBeenCalledTimes(1);
    expect(fn).toHaveBeenCalledWith(0);

    s.value = 5;
    expect(fn).toHaveBeenCalledTimes(2);
    expect(fn).toHaveBeenCalledWith(10);

    owner.dispose();

    s.value = 10;
    expect(fn).toHaveBeenCalledTimes(2); // effect no longer runs
  });

  // -----------------------------------------------------------------------
  // runWithOwner return value
  // -----------------------------------------------------------------------

  it('runWithOwner returns the value of the callback', () => {
    const owner = createOwner();
    const result = runWithOwner(owner, () => 42);
    expect(result).toBe(42);
  });

  it('runWithOwner returns undefined for void callbacks', () => {
    const owner = createOwner();
    const result = runWithOwner(owner, () => {});
    expect(result).toBeUndefined();
  });

  // -----------------------------------------------------------------------
  // Effect inside effect still works with ownership
  // -----------------------------------------------------------------------

  it('effects created inside effects are still parented correctly with owners', () => {
    const owner = createOwner();
    const s = signal(0);
    const innerFn = vi.fn();

    runWithOwner(owner, () => {
      effect(() => {
        // Inner effect — should be owned by outer effect
        effect(() => {
          innerFn(s.value);
        });
      });
    });

    expect(innerFn).toHaveBeenCalledTimes(1);

    // Disposing owner kills the outer effect which kills the inner
    owner.dispose();

    s.value = 1;
    expect(innerFn).toHaveBeenCalledTimes(1);
  });

  // -----------------------------------------------------------------------
  // runWithOwner on a disposed owner
  // -----------------------------------------------------------------------

  it('runWithOwner on a disposed owner does not run the callback', () => {
    const owner = createOwner();
    owner.dispose();

    const fn = vi.fn();
    runWithOwner(owner, fn);

    expect(fn).not.toHaveBeenCalled();
  });
});
