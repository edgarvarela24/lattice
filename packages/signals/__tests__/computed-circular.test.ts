import { describe, it, expect, vi } from 'vitest';
import { signal } from '../src/index.js';
import { computed } from '../src/computed.js';
import { effect } from '../src/effect.js';

describe('computed — circular dependency detection', () => {
  // -----------------------------------------------------------------------
  // 1. Self-referencing computed
  // -----------------------------------------------------------------------

  it('throws a clear error when a computed reads itself', () => {
    // Use signal gate to avoid TDZ — fn doesn't read c during construction
    const gate = signal(false);
    const c = computed((): number => {
      if (gate.value) return (c as any).value + 1;
      return 0;
    });

    // Initial evaluation works (gate is false)
    expect(c.value).toBe(0);

    // Open the gate — now the cycle exists
    gate.value = true;
    expect(() => c.value).toThrow(/circular/i);
  });

  it('self-referencing computed throws on every subsequent read (not just the first)', () => {
    const gate = signal(false);
    const c = computed((): number => {
      if (gate.value) return (c as any).value + 1;
      return 0;
    });

    expect(c.value).toBe(0);
    gate.value = true;

    expect(() => c.value).toThrow(/circular/i);
    expect(() => c.value).toThrow(/circular/i);
    expect(() => c.value).toThrow(/circular/i);
  });

  // -----------------------------------------------------------------------
  // 2. Two-node cycle: A ↔ B
  // -----------------------------------------------------------------------

  it('throws when two computeds form a cycle (A reads B, B reads A)', () => {
    const gate = signal(false);
    // b is declared first so it exists when a's fn runs eagerly
    const b: any = computed((): number => {
      if (gate.value) return a.value + 1;
      return 0;
    });
    const a: any = computed((): number => b.value + 1);

    // No cycle yet — b returns 0, a returns 1
    expect(a.value).toBe(1);

    // Activate the cycle
    gate.value = true;
    expect(() => a.value).toThrow(/circular/i);
  });

  it('the cycle is detected regardless of which node is read first', () => {
    const gate = signal(false);
    const b: any = computed((): number => {
      if (gate.value) return a.value + 1;
      return 0;
    });
    const a: any = computed((): number => b.value + 1);

    expect(b.value).toBe(0);
    gate.value = true;

    // Reading b first should also detect the cycle
    expect(() => b.value).toThrow(/circular/i);
  });

  // -----------------------------------------------------------------------
  // 3. Three-node cycle: A → B → C → A
  // -----------------------------------------------------------------------

  it('detects a cycle through three computeds (A → B → C → A)', () => {
    const gate = signal(false);
    // c declared first (gated), then a and b can reference it
    const c: any = computed((): number => {
      if (gate.value) return b.value + 1;
      return 0;
    });
    const a: any = computed((): number => c.value + 1);
    const b: any = computed((): number => a.value + 1);

    // No cycle — c=0, a=1, b=2
    expect(a.value).toBe(1);

    gate.value = true;
    expect(() => a.value).toThrow(/circular/i);
  });

  // -----------------------------------------------------------------------
  // 4. Conditional cycle — only triggered by a code path
  // -----------------------------------------------------------------------

  it('works fine when the cyclic path is not taken, throws when it is', () => {
    const useSelf = signal(false);

    const c = computed((): number => {
      if (useSelf.value) return (c as any).value + 1;
      return 42;
    });

    // No cycle — the self-referencing branch is not taken
    expect(c.value).toBe(42);

    // Flip the signal — now the cyclic path executes
    useSelf.value = true;
    expect(() => c.value).toThrow(/circular/i);
  });

  it('recovers when the conditional cycle is removed', () => {
    const useSelf = signal(false);

    const c = computed((): number => {
      if (useSelf.value) return (c as any).value + 1;
      return 42;
    });

    expect(c.value).toBe(42);

    // Trigger the cycle
    useSelf.value = true;
    expect(() => c.value).toThrow(/circular/i);

    // Remove the cycle — should recover
    useSelf.value = false;
    expect(c.value).toBe(42);
  });

  // -----------------------------------------------------------------------
  // 5. System consistency after a circular dependency error
  // -----------------------------------------------------------------------

  it('other computed signals still work after a cycle is detected', () => {
    const s = signal(10);
    const gate = signal(false);
    const good = computed(() => s.value * 2);
    const bad = computed((): number => {
      if (gate.value) return (bad as any).value + 1;
      return 0;
    });

    // Set up the cycle
    gate.value = true;

    // bad throws
    expect(() => bad.value).toThrow(/circular/i);

    // good is unaffected
    expect(good.value).toBe(20);
    s.value = 5;
    expect(good.value).toBe(10);
  });

  it('the evaluating flag is cleaned up even after the error (no permanent corruption)', () => {
    const s = signal(1);
    const c = computed((): number => {
      if (s.value < 0) return (c as any).value; // cycle
      return s.value * 2;
    });

    // Works initially
    expect(c.value).toBe(2);

    // Trigger the cycle
    s.value = -1;
    expect(() => c.value).toThrow(/circular/i);

    // Fix the input — the computed must not be stuck in "evaluating" state
    s.value = 5;
    expect(c.value).toBe(10);
  });

  // -----------------------------------------------------------------------
  // 6. Cycle detection does not false-positive on diamond dependencies
  // -----------------------------------------------------------------------

  it('does NOT false-positive on diamond-shaped dependencies (A → B, A → C, B → D, C → D)', () => {
    const s = signal(1);
    const b = computed(() => s.value + 1);
    const c = computed(() => s.value * 2);
    const d = computed(() => b.value + c.value);

    // d reads b and c, both read s — this is a diamond, NOT a cycle
    expect(d.value).toBe(4); // (1+1) + (1*2) = 4

    s.value = 3;
    expect(d.value).toBe(10); // (3+1) + (3*2) = 10
  });

  it('does NOT false-positive when the same computed is read multiple times', () => {
    const s = signal(5);
    const c = computed(() => s.value * 2);

    // Reading c.value twice in sequence is not a cycle
    expect(c.value).toBe(10);
    expect(c.value).toBe(10);

    s.value = 7;
    expect(c.value).toBe(14);
    expect(c.value).toBe(14);
  });

  // -----------------------------------------------------------------------
  // 7. Cycle detected during notify (eager evaluation with dependents)
  // -----------------------------------------------------------------------

  it('cycle during eager evaluation in notify propagates the error correctly', () => {
    const s = signal(1);
    const c = computed((): number => {
      if (s.value < 0) return (c as any).value; // cycle
      return s.value;
    });

    const errors: Error[] = [];
    effect(() => {
      try {
        void c.value;
      } catch (e) {
        errors.push(e as Error);
      }
    });

    expect(errors).toEqual([]);

    // Trigger the cycle — the effect should catch the circular dependency error
    s.value = -1;
    expect(errors.length).toBe(1);
    expect(errors[0].message).toMatch(/circular/i);

    // Recovery
    s.value = 5;
    // The effect should have re-run successfully
  });
});
