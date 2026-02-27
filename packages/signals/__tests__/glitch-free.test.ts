import { describe, it, expect, vi } from 'vitest';
import { signal } from '../src/index.js';
import { effect } from '../src/effect.js';
import { computed } from '../src/computed.js';

describe('glitch-free propagation', () => {
  // -----------------------------------------------------------------------
  // No regressions — basic notification still works
  // -----------------------------------------------------------------------

  it('signal write outside batch still notifies subscribers', () => {
    const s = signal(0);
    const fn = vi.fn();
    s.subscribe(fn);

    s.value = 1;
    expect(fn).toHaveBeenCalledTimes(1);
    expect(fn).toHaveBeenCalledWith(1, 0);

    s.value = 2;
    expect(fn).toHaveBeenCalledTimes(2);
    expect(fn).toHaveBeenCalledWith(2, 1);
  });

  // -----------------------------------------------------------------------
  // Diamond dependency — effect sees consistent state in one run
  // -----------------------------------------------------------------------

  it('diamond dependency without batch — effect runs once with consistent values', () => {
    const s = signal(1);
    const a = computed(() => s.value * 2);
    const b = computed(() => s.value * 3);

    const seen: Array<[number, number]> = [];
    effect(() => {
      seen.push([a.value, b.value]);
    });

    // Initial run
    expect(seen).toEqual([[2, 3]]);

    // Update signal — effect should run exactly once with consistent pair
    s.value = 2;
    expect(seen).toEqual([
      [2, 3],
      [4, 6],
    ]);
  });

  // -----------------------------------------------------------------------
  // Multiple sequential signal writes — no glitched intermediate runs
  // -----------------------------------------------------------------------

  it('multiple signals written sequentially outside batch — effect runs once per write', () => {
    const a = signal(1);
    const b = signal(10);

    const seen: Array<[number, number]> = [];
    effect(() => {
      seen.push([a.value, b.value]);
    });

    expect(seen).toEqual([[1, 10]]);

    a.value = 2;
    expect(seen).toEqual([
      [1, 10],
      [2, 10],
    ]);

    b.value = 20;
    expect(seen).toEqual([
      [1, 10],
      [2, 10],
      [2, 20],
    ]);
  });

  // -----------------------------------------------------------------------
  // Nested computed chain — correct final value, single effect run
  // -----------------------------------------------------------------------

  it('nested computed chain without batch — effect sees correct final value and runs once', () => {
    const s = signal(1);
    const a = computed(() => s.value + 1);
    const b = computed(() => a.value * 10);

    const seen: number[] = [];
    effect(() => {
      seen.push(b.value);
    });

    expect(seen).toEqual([20]);

    s.value = 2;
    expect(seen).toEqual([20, 30]);
  });

  // -----------------------------------------------------------------------
  // Effect that writes to another signal — converges without infinite loop
  // -----------------------------------------------------------------------

  it('effect that writes to another signal during re-run converges without infinite loop', () => {
    const source = signal(1);
    const derived = signal(0);

    effect(() => {
      derived.value = source.value * 2;
    });

    expect(derived.peek()).toBe(2);

    source.value = 5;
    expect(derived.peek()).toBe(10);
  });

  // -----------------------------------------------------------------------
  // Three computeds fed by one signal — single consistent update
  // -----------------------------------------------------------------------

  it('effect reading three computeds all fed by one signal — single consistent update', () => {
    const s = signal(1);
    const a = computed(() => s.value + 1);
    const b = computed(() => s.value + 2);
    const c = computed(() => s.value + 3);

    const seen: Array<[number, number, number]> = [];
    effect(() => {
      seen.push([a.value, b.value, c.value]);
    });

    expect(seen).toEqual([[2, 3, 4]]);

    s.value = 10;
    expect(seen).toEqual([
      [2, 3, 4],
      [11, 12, 13],
    ]);
  });
});
