import { describe, it, expect, vi } from 'vitest';
import { signal } from '../src/index.js';
import { effect } from '../src/effect.js';
import { computed } from '../src/computed.js';

describe('ownership and automatic disposal', () => {
  // --- No regressions for top-level effects ---

  it('top-level effect with no parent works the same as before', () => {
    const s = signal(0);
    const fn = vi.fn(() => {
      void s.value;
    });

    const e = effect(fn);
    expect(fn).toHaveBeenCalledTimes(1);
    expect(e.active).toBe(true);

    s.value = 1;
    expect(fn).toHaveBeenCalledTimes(2);

    e.dispose();
    expect(e.active).toBe(false);
  });

  // --- Basic parent-child ownership ---

  it('effect created inside another effect is automatically owned by the parent', () => {
    const s = signal(0);
    let childDisposable: ReturnType<typeof effect> | undefined;

    const parent = effect(() => {
      void s.value;
      childDisposable = effect(() => {});
    });

    expect(parent.active).toBe(true);
    expect(childDisposable).toBeDefined();
    expect(childDisposable!.active).toBe(true);
  });

  it('disposing the parent also disposes the child', () => {
    let childDisposable: ReturnType<typeof effect> | undefined;

    const parent = effect(() => {
      childDisposable = effect(() => {});
    });

    expect(childDisposable!.active).toBe(true);

    parent.dispose();
    expect(parent.active).toBe(false);
    expect(childDisposable!.active).toBe(false);
  });

  it('disposed child does not re-run when its dependency changes', () => {
    const childSignal = signal(0);
    const childFn = vi.fn(() => {
      void childSignal.value;
    });

    const parent = effect(() => {
      effect(childFn);
    });

    expect(childFn).toHaveBeenCalledTimes(1);

    parent.dispose();

    childSignal.value = 1;
    expect(childFn).toHaveBeenCalledTimes(1); // should NOT re-run
  });

  it("disposing the parent cleans up the child's signal subscriptions", () => {
    const childSignal = signal(0);
    const childFn = vi.fn(() => {
      void childSignal.value;
    });

    const parent = effect(() => {
      effect(childFn);
    });

    expect(childFn).toHaveBeenCalledTimes(1);

    parent.dispose();

    // Changing the signal should not trigger anything — subscription is gone
    childSignal.value = 42;
    expect(childFn).toHaveBeenCalledTimes(1);
  });

  // --- Recursive disposal ---

  it('recursive disposal — disposing grandparent disposes parent and child', () => {
    let childDisposable: ReturnType<typeof effect> | undefined;
    let parentDisposable: ReturnType<typeof effect> | undefined;

    const grandparent = effect(() => {
      parentDisposable = effect(() => {
        childDisposable = effect(() => {});
      });
    });

    expect(grandparent.active).toBe(true);
    expect(parentDisposable!.active).toBe(true);
    expect(childDisposable!.active).toBe(true);

    grandparent.dispose();
    expect(grandparent.active).toBe(false);
    expect(parentDisposable!.active).toBe(false);
    expect(childDisposable!.active).toBe(false);
  });

  it('recursive disposal prevents re-runs at every level', () => {
    const grandparentSignal = signal(0);
    const parentSignal = signal(0);
    const childSignal = signal(0);

    const childFn = vi.fn(() => {
      void childSignal.value;
    });
    const parentFn = vi.fn(() => {
      void parentSignal.value;
      effect(childFn);
    });
    const grandparentFn = vi.fn(() => {
      void grandparentSignal.value;
      effect(parentFn);
    });

    const grandparent = effect(grandparentFn);

    expect(grandparentFn).toHaveBeenCalledTimes(1);
    expect(parentFn).toHaveBeenCalledTimes(1);
    expect(childFn).toHaveBeenCalledTimes(1);

    grandparent.dispose();

    grandparentSignal.value = 1;
    parentSignal.value = 1;
    childSignal.value = 1;

    expect(grandparentFn).toHaveBeenCalledTimes(1);
    expect(parentFn).toHaveBeenCalledTimes(1);
    expect(childFn).toHaveBeenCalledTimes(1);
  });

  // --- Multiple children ---

  it('parent with multiple child effects — disposing parent disposes all children', () => {
    const disposables: ReturnType<typeof effect>[] = [];

    const parent = effect(() => {
      disposables.push(effect(() => {}));
      disposables.push(effect(() => {}));
      disposables.push(effect(() => {}));
    });

    expect(disposables).toHaveLength(3);
    expect(disposables.every((d) => d.active)).toBe(true);

    parent.dispose();
    expect(disposables.every((d) => !d.active)).toBe(true);
  });

  // --- Disposing a child does NOT affect parent or siblings ---

  it('disposing a child directly does NOT dispose the parent', () => {
    let childDisposable: ReturnType<typeof effect> | undefined;

    const parent = effect(() => {
      childDisposable = effect(() => {});
    });

    childDisposable!.dispose();
    expect(childDisposable!.active).toBe(false);
    expect(parent.active).toBe(true);
  });

  it('disposing a child directly does NOT dispose siblings', () => {
    let child1: ReturnType<typeof effect> | undefined;
    let child2: ReturnType<typeof effect> | undefined;
    let child3: ReturnType<typeof effect> | undefined;

    const parent = effect(() => {
      child1 = effect(() => {});
      child2 = effect(() => {});
      child3 = effect(() => {});
    });

    child2!.dispose();
    expect(child2!.active).toBe(false);
    expect(child1!.active).toBe(true);
    expect(child3!.active).toBe(true);
    expect(parent.active).toBe(true);
  });

  // --- Parent re-run disposes old children ---

  it('parent effect re-running disposes old children and creates new ones', () => {
    const parentSignal = signal(0);
    let oldChild: ReturnType<typeof effect> | undefined;
    let latestChild: ReturnType<typeof effect> | undefined;

    effect(() => {
      void parentSignal.value;
      latestChild = effect(() => {});
    });

    oldChild = latestChild;
    expect(oldChild!.active).toBe(true);

    // Re-run the parent — old child should be disposed
    parentSignal.value = 1;
    expect(oldChild!.active).toBe(false);
    expect(latestChild!.active).toBe(true);
    expect(latestChild).not.toBe(oldChild);
  });

  it('old children from a previous run are disposed before the new run executes', () => {
    const parentSignal = signal(0);
    const childSignal = signal(0);
    const childFn = vi.fn(() => {
      void childSignal.value;
    });

    effect(() => {
      void parentSignal.value;
      effect(childFn);
    });

    expect(childFn).toHaveBeenCalledTimes(1);

    // Re-run parent — old child should be disposed, new child created
    parentSignal.value = 1;
    // childFn called again due to new child creation during parent re-run
    expect(childFn).toHaveBeenCalledTimes(2);

    // The old child's subscription is cleaned up — only the new child's subscription remains
    childSignal.value = 1;
    expect(childFn).toHaveBeenCalledTimes(3); // only the new child reacts
  });

  // --- Conditional child effects ---

  it('effect re-runs with different condition — old child is disposed, new child created', () => {
    const condition = signal(true);
    let childA: ReturnType<typeof effect> | undefined;
    let childB: ReturnType<typeof effect> | undefined;

    const fnA = vi.fn(() => {});
    const fnB = vi.fn(() => {});

    effect(() => {
      if (condition.value) {
        childA = effect(fnA);
      } else {
        childB = effect(fnB);
      }
    });

    expect(childA!.active).toBe(true);
    expect(childB).toBeUndefined();
    expect(fnA).toHaveBeenCalledTimes(1);

    // Switch condition — old child A should be disposed, child B created
    condition.value = false;
    expect(childA!.active).toBe(false);
    expect(childB!.active).toBe(true);
    expect(fnB).toHaveBeenCalledTimes(1);
  });

  // --- Child tracks its own signals independently ---

  it('child effect tracks its own signals independently from parent', () => {
    const parentSignal = signal(0);
    const childSignal = signal(0);

    const parentFn = vi.fn(() => {
      void parentSignal.value;
      effect(childFn);
    });
    const childFn = vi.fn(() => {
      void childSignal.value;
    });

    effect(parentFn);
    expect(parentFn).toHaveBeenCalledTimes(1);
    expect(childFn).toHaveBeenCalledTimes(1);

    // Changing child's signal should only re-run the child
    childSignal.value = 1;
    expect(parentFn).toHaveBeenCalledTimes(1);
    expect(childFn).toHaveBeenCalledTimes(2);
  });

  it('changing parent signal does not directly re-run child (child is disposed and recreated)', () => {
    const parentSignal = signal(0);
    const childSignal = signal(0);
    const childFn = vi.fn(() => {
      void childSignal.value;
    });

    effect(() => {
      void parentSignal.value;
      effect(childFn);
    });

    expect(childFn).toHaveBeenCalledTimes(1);

    // Parent re-runs → old child disposed, new child created (childFn called again)
    parentSignal.value = 1;
    expect(childFn).toHaveBeenCalledTimes(2);
  });

  // --- Ownership with computed ---

  it('effect owns child effects that read a computed — everything disposes cleanly', () => {
    const s = signal(1);
    const double = computed(() => s.value * 2);
    const childFn = vi.fn(() => {
      void double.value;
    });

    let childDisposable: ReturnType<typeof effect> | undefined;

    const parent = effect(() => {
      childDisposable = effect(childFn);
    });

    expect(childFn).toHaveBeenCalledTimes(1);
    expect(double.value).toBe(2);

    // Child reacts to computed changes
    s.value = 2;
    expect(childFn).toHaveBeenCalledTimes(2);
    expect(double.value).toBe(4);

    // Dispose parent — child should also be disposed
    parent.dispose();
    expect(childDisposable!.active).toBe(false);

    // Computed changes after disposal — child should NOT re-run
    s.value = 3;
    expect(childFn).toHaveBeenCalledTimes(2);
  });

  it('child effect reads computed and signal — disposal cleans up all subscriptions', () => {
    const a = signal(1);
    const b = signal(10);
    const sum = computed(() => a.value + b.value);
    const childFn = vi.fn(() => {
      void sum.value;
    });

    const parent = effect(() => {
      effect(childFn);
    });

    expect(childFn).toHaveBeenCalledTimes(1);

    a.value = 2;
    expect(childFn).toHaveBeenCalledTimes(2);

    parent.dispose();

    a.value = 3;
    b.value = 20;
    expect(childFn).toHaveBeenCalledTimes(2); // no re-runs after disposal
  });

  // --- Edge cases ---

  it('disposing an already-disposed effect is a no-op', () => {
    const parent = effect(() => {
      effect(() => {});
    });

    parent.dispose();
    expect(parent.active).toBe(false);

    // Should not throw
    expect(() => parent.dispose()).not.toThrow();
    expect(parent.active).toBe(false);
  });

  it('deeply nested ownership — 4 levels deep, top-level dispose cleans everything', () => {
    let level1: ReturnType<typeof effect> | undefined;
    let level2: ReturnType<typeof effect> | undefined;
    let level3: ReturnType<typeof effect> | undefined;

    const root = effect(() => {
      level1 = effect(() => {
        level2 = effect(() => {
          level3 = effect(() => {});
        });
      });
    });

    expect(root.active).toBe(true);
    expect(level1!.active).toBe(true);
    expect(level2!.active).toBe(true);
    expect(level3!.active).toBe(true);

    root.dispose();
    expect(root.active).toBe(false);
    expect(level1!.active).toBe(false);
    expect(level2!.active).toBe(false);
    expect(level3!.active).toBe(false);
  });

  it('multiple parent re-runs — each re-run disposes previous children', () => {
    const trigger = signal(0);
    const children: ReturnType<typeof effect>[] = [];

    effect(() => {
      void trigger.value;
      children.push(effect(() => {}));
    });

    expect(children).toHaveLength(1);
    expect(children[0].active).toBe(true);

    trigger.value = 1;
    expect(children).toHaveLength(2);
    expect(children[0].active).toBe(false); // old child disposed
    expect(children[1].active).toBe(true); // new child active

    trigger.value = 2;
    expect(children).toHaveLength(3);
    expect(children[0].active).toBe(false);
    expect(children[1].active).toBe(false); // previous child disposed
    expect(children[2].active).toBe(true); // latest child active
  });
});
