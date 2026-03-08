import { describe, it, expect } from 'vitest';
import { signal } from '../src/index.js';
import { effect } from '../src/effect.js';
import { computed } from '../src/computed.js';
import { batch } from '../src/batch.js';
import { createOwner, runWithOwner } from '../src/owner.js';

// Helper: measure execution time in milliseconds
function measure(fn: () => void): number {
  const start = performance.now();
  fn();
  return performance.now() - start;
}

// Helper: format results
function report(label: string, timeMs: number, ops?: number) {
  const opsStr = ops ? ` | ${((ops / timeMs) * 1000).toFixed(0)} ops/sec` : '';
  console.log(`  ⏱  ${label}: ${timeMs.toFixed(2)}ms${opsStr}`);
}

describe('performance baselines', () => {
  // -----------------------------------------------------------------------
  // Signal creation
  // -----------------------------------------------------------------------

  it('create 10,000 signals', () => {
    const time = measure(() => {
      for (let i = 0; i < 10_000; i++) {
        signal(i);
      }
    });
    report('Create 10k signals', time, 10_000);
    expect(time).toBeLessThan(1000); // generous ceiling — just catch regressions
  });

  it('create 100,000 signals', () => {
    const time = measure(() => {
      for (let i = 0; i < 100_000; i++) {
        signal(i);
      }
    });
    report('Create 100k signals', time, 100_000);
    expect(time).toBeLessThan(5000);
  });

  // -----------------------------------------------------------------------
  // Signal reads and writes
  // -----------------------------------------------------------------------

  it('100,000 signal reads', () => {
    const s = signal(42);
    let sum = 0;
    const time = measure(() => {
      for (let i = 0; i < 100_000; i++) {
        sum += s.value;
      }
    });
    report('100k signal reads', time, 100_000);
    expect(sum).toBe(42 * 100_000);
    expect(time).toBeLessThan(1000);
  });

  it('100,000 signal writes (no observers)', () => {
    const s = signal(0);
    const time = measure(() => {
      for (let i = 0; i < 100_000; i++) {
        s.value = i;
      }
    });
    report('100k signal writes (no observers)', time, 100_000);
    expect(time).toBeLessThan(1000);
  });

  it('10,000 signal writes with one effect', () => {
    const s = signal(-1);
    let runCount = 0;
    const e = effect(() => {
      void s.value;
      runCount++;
    });

    runCount = 0; // reset after initial run
    const time = measure(() => {
      for (let i = 0; i < 10_000; i++) {
        s.value = i;
      }
    });
    report('10k signal writes (1 effect)', time, 10_000);
    expect(runCount).toBe(10_000);
    expect(time).toBeLessThan(2000);
    e.dispose();
  });

  // -----------------------------------------------------------------------
  // Computed creation and evaluation
  // -----------------------------------------------------------------------

  it('create 1,000 computeds in a chain', () => {
    const s = signal(0);
    const computeds: any[] = [];

    const time = measure(() => {
      computeds.push(computed(() => s.value + 1));
      for (let i = 1; i < 1_000; i++) {
        const prev = computeds[i - 1];
        computeds.push(computed(() => prev.value + 1));
      }
    });

    // Verify correctness
    expect(computeds[999].value).toBe(1000);

    report('Create 1k computed chain', time, 1_000);
    expect(time).toBeLessThan(2000);
  });

  it('propagate through 1,000 computed chain', () => {
    const s = signal(0);
    const computeds: any[] = [];

    computeds.push(computed(() => s.value + 1));
    for (let i = 1; i < 1_000; i++) {
      const prev = computeds[i - 1];
      computeds.push(computed(() => prev.value + 1));
    }

    const time = measure(() => {
      s.value = 1;
      // Force evaluation at the end of the chain
      void computeds[999].value;
    });

    expect(computeds[999].value).toBe(1001);
    report('Propagate through 1k chain', time);
    expect(time).toBeLessThan(2000);
  });

  // -----------------------------------------------------------------------
  // Diamond dependency fan-out
  // -----------------------------------------------------------------------

  it('diamond: 1 signal → 100 computeds → 1 effect', () => {
    const s = signal(-1);
    const layer = Array.from({ length: 100 }, (_, i) => computed(() => s.value + i));

    let runCount = 0;
    const e = effect(() => {
      let sum = 0;
      for (const c of layer) {
        sum += c.value;
      }
      runCount++;
    });

    runCount = 0;
    const time = measure(() => {
      for (let i = 0; i < 100; i++) {
        s.value = i;
      }
    });

    report('Diamond 1→100→1, 100 updates', time, 100);
    expect(runCount).toBe(100);
    expect(time).toBeLessThan(2000);
    e.dispose();
  });

  it('diamond: 1 signal → 1000 computeds → 1 effect', () => {
    const s = signal(-1);
    const layer = Array.from({ length: 1_000 }, (_, i) => computed(() => s.value + i));

    let runCount = 0;
    const e = effect(() => {
      let sum = 0;
      for (const c of layer) {
        sum += c.value;
      }
      runCount++;
    });

    runCount = 0;
    const time = measure(() => {
      for (let i = 0; i < 100; i++) {
        s.value = i;
      }
    });

    report('Diamond 1→1000→1, 100 updates', time, 100);
    expect(runCount).toBe(100);
    expect(time).toBeLessThan(5000);
    e.dispose();
  });

  // -----------------------------------------------------------------------
  // Fan-out: 1 signal → N effects
  // -----------------------------------------------------------------------

  it('fan-out: 1 signal → 1,000 effects', () => {
    const s = signal(0);
    const owner = createOwner();
    let totalRuns = 0;

    runWithOwner(owner, () => {
      for (let i = 0; i < 1_000; i++) {
        effect(() => {
          void s.value;
          totalRuns++;
        });
      }
    });

    totalRuns = 0;
    const time = measure(() => {
      s.value = 1;
    });

    report('Fan-out 1→1000 effects, single write', time);
    expect(totalRuns).toBe(1_000);
    expect(time).toBeLessThan(2000);
    owner.dispose();
  });

  it('fan-out: 1 signal → 10,000 effects', () => {
    const s = signal(0);
    const owner = createOwner();
    let totalRuns = 0;

    runWithOwner(owner, () => {
      for (let i = 0; i < 10_000; i++) {
        effect(() => {
          void s.value;
          totalRuns++;
        });
      }
    });

    totalRuns = 0;
    const time = measure(() => {
      s.value = 1;
    });

    report('Fan-out 1→10k effects, single write', time);
    expect(totalRuns).toBe(10_000);
    expect(time).toBeLessThan(5000);
    owner.dispose();
  });

  // -----------------------------------------------------------------------
  // Fan-in: N signals → 1 computed → 1 effect
  // -----------------------------------------------------------------------

  it('fan-in: 100 signals → 1 computed → 1 effect', () => {
    const signals = Array.from({ length: 100 }, (_, i) => signal(i));
    const sum = computed(() => signals.reduce((acc, s) => acc + s.value, 0));

    let runCount = 0;
    const e = effect(() => {
      void sum.value;
      runCount++;
    });

    runCount = 0;
    const time = measure(() => {
      batch(() => {
        for (let i = 0; i < 100; i++) {
          signals[i].value = i + 100;
        }
      });
    });

    report('Fan-in 100→1→1, batched write', time);
    expect(runCount).toBe(1);
    expect(sum.value).toBe(100 * 100 + (100 * 99) / 2);
    expect(time).toBeLessThan(2000);
    e.dispose();
  });

  // -----------------------------------------------------------------------
  // Batch performance
  // -----------------------------------------------------------------------

  it('batch 10,000 writes to same signal', () => {
    const s = signal(0);
    let runCount = 0;
    const e = effect(() => {
      void s.value;
      runCount++;
    });

    runCount = 0;
    const time = measure(() => {
      batch(() => {
        for (let i = 0; i < 10_000; i++) {
          s.value = i;
        }
      });
    });

    report('Batch 10k writes to 1 signal', time, 10_000);
    expect(runCount).toBe(1);
    expect(time).toBeLessThan(1000);
    e.dispose();
  });

  it('batch 1,000 writes to 1,000 different signals', () => {
    const signals = Array.from({ length: 1_000 }, (_, i) => signal(i));
    let runCount = 0;

    const e = effect(() => {
      for (const s of signals) {
        void s.value;
      }
      runCount++;
    });

    runCount = 0;
    const time = measure(() => {
      batch(() => {
        for (let i = 0; i < 1_000; i++) {
          signals[i].value = i + 1_000;
        }
      });
    });

    report('Batch 1k writes to 1k signals', time);
    expect(runCount).toBe(1);
    expect(time).toBeLessThan(2000);
    e.dispose();
  });

  // -----------------------------------------------------------------------
  // Owner creation and disposal
  // -----------------------------------------------------------------------

  it('create and dispose 1,000 owners with effects', () => {
    const s = signal(0);

    const time = measure(() => {
      for (let i = 0; i < 1_000; i++) {
        const owner = createOwner();
        runWithOwner(owner, () => {
          effect(() => {
            void s.value;
          });
        });
        owner.dispose();
      }
    });

    report('Create/dispose 1k owners with effects', time, 1_000);
    expect(time).toBeLessThan(2000);
  });

  // -----------------------------------------------------------------------
  // Computed equality skip — version check performance
  // -----------------------------------------------------------------------

  it('computed that always returns same value — effect skips re-run', () => {
    const s = signal(0);
    const clamped = computed(() => Math.min(s.value, 10));

    let runCount = 0;
    const e = effect(() => {
      void clamped.value;
      runCount++;
    });

    // Push signal above clamp threshold
    s.value = 15;
    runCount = 0;

    const time = measure(() => {
      for (let i = 0; i < 10_000; i++) {
        s.value = 20 + i; // all clamp to 10
      }
    });

    report('10k writes, computed stable, effect skips', time, 10_000);
    expect(runCount).toBe(0);
    expect(time).toBeLessThan(2000);
    e.dispose();
  });

  // -----------------------------------------------------------------------
  // Summary — print all at once for easy comparison
  // -----------------------------------------------------------------------

  it('prints baseline summary', () => {
    console.log('\n  ────────────────────────────────────────');
    console.log('  Record these numbers as Phase 1.5 baselines.');
    console.log('  Compare against Phase 2 (deep reactivity) to measure overhead.');
    console.log('  ────────────────────────────────────────\n');
  });
});
