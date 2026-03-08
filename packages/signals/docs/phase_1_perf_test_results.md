# Performance Baselines — Phase 1.5

**Date:** March 2026
**Stage:** Pre-deep-reactivity (Phase 1.5 complete)
**Environment:** Vitest, Node.js

Compare these numbers against Phase 2 (deep reactivity) to measure proxy overhead.

---

## Signal Creation

| Benchmark           | Time     | Throughput      |
| ------------------- | -------- | --------------- |
| Create 10k signals  | 38.17ms  | 261,981 ops/sec |
| Create 100k signals | 172.91ms | 578,330 ops/sec |

## Signal Reads & Writes

| Benchmark                         | Time    | Throughput         |
| --------------------------------- | ------- | ------------------ |
| 100k signal reads                 | 7.69ms  | 13,012,008 ops/sec |
| 100k signal writes (no observers) | 84.31ms | 1,186,034 ops/sec  |
| 10k signal writes (1 effect)      | 35.42ms | 282,287 ops/sec    |

## Computed Chains

| Benchmark                  | Time   | Throughput      |
| -------------------------- | ------ | --------------- |
| Create 1k computed chain   | 5.34ms | 187,430 ops/sec |
| Propagate through 1k chain | 2.85ms | —               |

## Diamond Dependency

| Benchmark                                          | Time     | Throughput    |
| -------------------------------------------------- | -------- | ------------- |
| 1 signal → 100 computeds → 1 effect (100 updates)  | 17.67ms  | 5,658 ops/sec |
| 1 signal → 1000 computeds → 1 effect (100 updates) | 206.11ms | 485 ops/sec   |

## Fan-Out (1 signal → N effects)

| Benchmark                             | Time    |
| ------------------------------------- | ------- |
| 1 signal → 1k effects (single write)  | 1.96ms  |
| 1 signal → 10k effects (single write) | 25.24ms |

## Fan-In (N signals → 1 computed → 1 effect)

| Benchmark                                     | Time   |
| --------------------------------------------- | ------ |
| 100 signals → 1 computed → 1 effect (batched) | 0.42ms |

## Batching

| Benchmark                     | Time   | Throughput        |
| ----------------------------- | ------ | ----------------- |
| Batch 10k writes to 1 signal  | 3.09ms | 3,236,480 ops/sec |
| Batch 1k writes to 1k signals | 1.28ms | —                 |

## Ownership

| Benchmark                             | Time   | Throughput      |
| ------------------------------------- | ------ | --------------- |
| Create/dispose 1k owners with effects | 4.65ms | 214,907 ops/sec |

## Version Check (Glitch Prevention)

| Benchmark                                 | Time    | Throughput      |
| ----------------------------------------- | ------- | --------------- |
| 10k writes, computed stable, effect skips | 22.33ms | 447,748 ops/sec |

## Memory Per Instance

| Primitive | Closure (before) | Class (after) | Reduction |
| --------- | ---------------- | ------------- | --------- |
| Signal    | 1,416 bytes      | 537 bytes     | 2.6x      |
| Computed  | —                | —             | —         |
| Effect    | —                | —             | —         |

Fill in computed and effect rows after class migration is complete.

---

## Notes

- **Reads (13M ops/sec)** are the hot path for templates. In good shape.
- **Writes without observers (1.1M ops/sec)** incur batch overhead even with no listeners. A fast path skipping batch when `listeners.size === 0` could help.
- **Diamond 1→1000→1 (206ms)** is the slowest benchmark. Topological sorting in Phase 2 should improve this significantly.
- **Version check payoff is real** — 10k writes where the computed value didn't change resulted in zero effect re-runs.
- **Batching works well** — 10k writes batched into a single effect run in 3ms.
- **Class migration reduced signal memory by 2.6x.** At 10k signals: 14MB → 5MB. Expect similar reductions for computed and effect.
