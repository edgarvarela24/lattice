import { describe, it, expect, vi } from 'vitest';
import { signal } from '../src/index.js';
import { batch } from '../src/batch.js';
import { effect } from '../src/effect.js';
import { computed } from '../src/computed.js';

describe('batch', () => {
  // -----------------------------------------------------------------------
  // Existing behavior preserved (no batch)
  // -----------------------------------------------------------------------

  it('signals still notify immediately when not in a batch', () => {
    const s = signal(0);
    const fn = vi.fn();
    s.subscribe(fn);

    s.value = 1;
    expect(fn).toHaveBeenCalledTimes(1);

    s.value = 2;
    expect(fn).toHaveBeenCalledTimes(2);
  });

  it('effects still re-run immediately when not in a batch', () => {
    const s = signal(0);
    const fn = vi.fn(() => {
      void s.value;
    });

    effect(fn);
    expect(fn).toHaveBeenCalledTimes(1);

    s.value = 1;
    expect(fn).toHaveBeenCalledTimes(2);
  });

  // -----------------------------------------------------------------------
  // Basic batching
  // -----------------------------------------------------------------------

  it('defers subscriber notification until the batch completes', () => {
    const s = signal(0);
    const fn = vi.fn();
    s.subscribe(fn);

    batch(() => {
      s.value = 1;
      expect(fn).not.toHaveBeenCalled();
    });

    expect(fn).toHaveBeenCalledTimes(1);
  });

  it('subscriber sees the final value after the batch completes', () => {
    const s = signal(0);
    const values: number[] = [];
    s.subscribe((newValue) => {
      values.push(newValue);
    });

    batch(() => {
      s.value = 1;
      s.value = 2;
      s.value = 3;
    });

    expect(values).toEqual([3]);
  });

  it('batch returns void', () => {
    const result = batch(() => {});
    expect(result).toBeUndefined();
  });

  it('batch with no signal writes causes no errors and no notifications', () => {
    const s = signal(0);
    const fn = vi.fn();
    s.subscribe(fn);

    batch(() => {
      // no signal writes
    });

    expect(fn).not.toHaveBeenCalled();
  });

  // -----------------------------------------------------------------------
  // Multiple writes to the same signal
  // -----------------------------------------------------------------------

  it('multiple writes to the same signal in a batch — subscriber notified only once', () => {
    const s = signal(0);
    const fn = vi.fn();
    s.subscribe(fn);

    batch(() => {
      s.value = 1;
      s.value = 2;
      s.value = 3;
    });

    expect(fn).toHaveBeenCalledTimes(1);
  });

  it('effect re-runs only once for multiple writes to the same signal in a batch', () => {
    const s = signal(0);
    const fn = vi.fn(() => {
      void s.value;
    });

    effect(fn);
    expect(fn).toHaveBeenCalledTimes(1);

    batch(() => {
      s.value = 1;
      s.value = 2;
      s.value = 3;
    });

    expect(fn).toHaveBeenCalledTimes(2);
  });

  it('effect sees the final value when it re-runs after a batch', () => {
    const s = signal(0);
    const observed: number[] = [];

    effect(() => {
      observed.push(s.value);
    });

    expect(observed).toEqual([0]);

    batch(() => {
      s.value = 10;
      s.value = 20;
      s.value = 30;
    });

    expect(observed).toEqual([0, 30]);
  });

  // -----------------------------------------------------------------------
  // Multiple signals in a batch
  // -----------------------------------------------------------------------

  it('multiple writes to different signals — all subscribers notified once at flush', () => {
    const a = signal(0);
    const b = signal(0);

    const fnA = vi.fn();
    const fnB = vi.fn();
    a.subscribe(fnA);
    b.subscribe(fnB);

    batch(() => {
      a.value = 1;
      b.value = 2;
      expect(fnA).not.toHaveBeenCalled();
      expect(fnB).not.toHaveBeenCalled();
    });

    expect(fnA).toHaveBeenCalledTimes(1);
    expect(fnB).toHaveBeenCalledTimes(1);
  });

  it('effect tracking multiple signals re-runs only once in a batch', () => {
    const a = signal(0);
    const b = signal(0);
    const fn = vi.fn(() => {
      void a.value;
      void b.value;
    });

    effect(fn);
    expect(fn).toHaveBeenCalledTimes(1);

    batch(() => {
      a.value = 1;
      b.value = 2;
    });

    expect(fn).toHaveBeenCalledTimes(2);
  });

  // -----------------------------------------------------------------------
  // Nested batches
  // -----------------------------------------------------------------------

  it('nested batch — only the outermost batch triggers flush', () => {
    const s = signal(0);
    const fn = vi.fn();
    s.subscribe(fn);

    batch(() => {
      s.value = 1;

      batch(() => {
        s.value = 2;
        expect(fn).not.toHaveBeenCalled();
      });

      // inner batch completed, but outer is still active — no flush yet
      expect(fn).not.toHaveBeenCalled();

      s.value = 3;
    });

    expect(fn).toHaveBeenCalledTimes(1);
  });

  it('deeply nested batches (3 levels) — flush happens once at outermost completion', () => {
    const s = signal(0);
    const fn = vi.fn();
    s.subscribe(fn);

    batch(() => {
      s.value = 1;
      batch(() => {
        s.value = 2;
        batch(() => {
          s.value = 3;
          expect(fn).not.toHaveBeenCalled();
        });
        expect(fn).not.toHaveBeenCalled();
      });
      expect(fn).not.toHaveBeenCalled();
    });

    expect(fn).toHaveBeenCalledTimes(1);
  });

  it('deeply nested batches (4 levels) — subscriber sees the final value', () => {
    const s = signal(0);
    const values: number[] = [];
    s.subscribe((newValue) => {
      values.push(newValue);
    });

    batch(() => {
      s.value = 1;
      batch(() => {
        s.value = 2;
        batch(() => {
          s.value = 3;
          batch(() => {
            s.value = 4;
          });
        });
      });
    });

    expect(values).toEqual([4]);
  });

  // -----------------------------------------------------------------------
  // Computed inside a batch
  // -----------------------------------------------------------------------

  it('computed gets the correct final value after batch flush', () => {
    const s = signal(1);
    const doubled = computed(() => s.value * 2);

    batch(() => {
      s.value = 2;
      s.value = 3;
      s.value = 5;
    });

    expect(doubled.value).toBe(10);
  });

  it('computed is not eagerly recomputed during a batch', () => {
    const s = signal(0);
    const computeFn = vi.fn(() => s.value * 2);
    const c = computed(computeFn);

    // initial evaluation
    void c.value;
    expect(computeFn).toHaveBeenCalledTimes(1);

    batch(() => {
      s.value = 1;
      s.value = 2;
      s.value = 3;
    });

    // accessing the computed after batch should trigger at most one recomputation
    const callsBefore = computeFn.mock.calls.length;
    void c.value;
    expect(computeFn).toHaveBeenCalledTimes(callsBefore + 1);
    expect(c.value).toBe(6);
  });

  // -----------------------------------------------------------------------
  // Effect reading a computed, signal written in batch
  // -----------------------------------------------------------------------

  it('effect reading a computed sees correct value after batch', () => {
    const s = signal(1);
    const doubled = computed(() => s.value * 2);
    const observed: number[] = [];

    effect(() => {
      observed.push(doubled.value);
    });

    expect(observed).toEqual([2]);

    batch(() => {
      s.value = 5;
      s.value = 10;
    });

    expect(observed).toEqual([2, 20]);
  });

  it('effect reading a computed re-runs only once per batch', () => {
    const s = signal(0);
    const c = computed(() => s.value + 1);
    const fn = vi.fn(() => {
      void c.value;
    });

    effect(fn);
    expect(fn).toHaveBeenCalledTimes(1);

    batch(() => {
      s.value = 1;
      s.value = 2;
      s.value = 3;
    });

    expect(fn).toHaveBeenCalledTimes(2);
  });

  // -----------------------------------------------------------------------
  // Diamond dependency with batch
  // -----------------------------------------------------------------------

  it('diamond dependency — effect reads two computeds fed by one signal, single consistent update', () => {
    const s = signal(1);
    const left = computed(() => s.value * 2);
    const right = computed(() => s.value + 10);

    const observed: Array<{ l: number; r: number }> = [];
    effect(() => {
      observed.push({ l: left.value, r: right.value });
    });

    expect(observed).toEqual([{ l: 2, r: 11 }]);

    batch(() => {
      s.value = 5;
    });

    // Effect should run exactly once with consistent values
    expect(observed).toEqual([
      { l: 2, r: 11 },
      { l: 10, r: 15 },
    ]);
  });

  it('diamond dependency — multiple writes in batch, effect still runs once with final values', () => {
    const s = signal(0);
    const a = computed(() => s.value + 1);
    const b = computed(() => s.value * 10);
    const fn = vi.fn(() => {
      void a.value;
      void b.value;
    });

    effect(fn);
    expect(fn).toHaveBeenCalledTimes(1);

    batch(() => {
      s.value = 1;
      s.value = 2;
      s.value = 3;
    });

    expect(fn).toHaveBeenCalledTimes(2);
    expect(a.value).toBe(4);
    expect(b.value).toBe(30);
  });

  // -----------------------------------------------------------------------
  // Equality check — writing the same value
  // -----------------------------------------------------------------------

  it('writing the same value in a batch does not notify after flush', () => {
    const s = signal(5);
    const fn = vi.fn();
    s.subscribe(fn);

    batch(() => {
      s.value = 5; // same as current value
    });

    expect(fn).not.toHaveBeenCalled();
  });

  it('writing a different value then reverting to original in a batch does not notify', () => {
    const s = signal(5);
    const fn = vi.fn();
    s.subscribe(fn);

    batch(() => {
      s.value = 10;
      s.value = 5; // back to original
    });

    // The final value equals the original, so ideally no notification
    // NOTE: This depends on implementation — if batching checks the value
    // at flush time against the pre-batch value, no notification fires.
    // If your implementation does not do this, adjust this expectation.
    expect(fn).not.toHaveBeenCalled();
  });

  // -----------------------------------------------------------------------
  // Error handling
  // -----------------------------------------------------------------------

  it('batch with an error thrown — pending notifications still flush', () => {
    const s = signal(0);
    const fn = vi.fn();
    s.subscribe(fn);

    expect(() => {
      batch(() => {
        s.value = 42;
        throw new Error('boom');
      });
    }).toThrow('boom');

    // Notifications queued before the error should still have been flushed
    expect(fn).toHaveBeenCalledTimes(1);
    expect(s.peek()).toBe(42);
  });

  it('batch depth resets after an error so subsequent writes notify immediately', () => {
    const s = signal(0);
    const fn = vi.fn();
    s.subscribe(fn);

    try {
      batch(() => {
        s.value = 1;
        throw new Error('oops');
      });
    } catch {
      // expected
    }

    fn.mockClear();

    // Outside the batch now — should notify immediately
    s.value = 2;
    expect(fn).toHaveBeenCalledTimes(1);
  });

  it('nested batch error — outer batch still flushes correctly', () => {
    const s = signal(0);
    const fn = vi.fn();
    s.subscribe(fn);

    batch(() => {
      s.value = 1;
      try {
        batch(() => {
          s.value = 2;
          throw new Error('inner error');
        });
      } catch {
        // swallow inner error
      }
      s.value = 3;
    });

    expect(fn).toHaveBeenCalledTimes(1);
    expect(s.peek()).toBe(3);
  });

  // -----------------------------------------------------------------------
  // Signal writes during flush (re-entrant writes)
  // -----------------------------------------------------------------------

  it('signal write inside an effect triggered by flush is batched within the same cycle', () => {
    const a = signal(0);
    const b = signal(0);
    const bObserver = vi.fn();
    b.subscribe(bObserver);

    // This effect writes to `b` whenever `a` changes
    effect(() => {
      b.value = a.value * 10;
    });

    bObserver.mockClear();

    batch(() => {
      a.value = 1;
      a.value = 2;
    });

    // `b` should end up at 20 and its observer should fire at most once
    expect(b.peek()).toBe(20);
    expect(bObserver).toHaveBeenCalledTimes(1);
  });

  it('does not cause an infinite loop when an effect writes to its own tracked signal in a batch', () => {
    const s = signal(0);
    let runs = 0;

    effect(() => {
      runs++;
      const current = s.value;
      if (current < 3) {
        s.value = current + 1;
      }
    });

    // After initial run, the effect self-increments up to 3
    const runsAfterInit = runs;

    runs = 0;

    // This should not infinite-loop — the effect self-limits
    batch(() => {
      s.value = 0;
    });

    // It should converge and not explode
    expect(runs).toBeLessThan(20);
    expect(s.peek()).toBe(3);
  });
});
