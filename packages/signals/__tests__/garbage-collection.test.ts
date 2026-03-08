import { describe, it, expect, beforeAll } from 'vitest';
import { signal } from '../src/index.js';
import { effect } from '../src/effect.js';
import { computed } from '../src/computed.js';
import { createOwner, runWithOwner } from '../src/owner.js';

// Helper: run GC and wait for weak refs to clear
async function forceGC() {
  for (let i = 0; i < 3; i++) {
    global.gc!();
    // Give the engine a tick to process finalizers
    await new Promise((resolve) => setTimeout(resolve, 10));
  }
}

beforeAll(() => {
  if (typeof global.gc !== 'function') {
    throw new Error(
      'Tests require --expose-gc. Add pool: "forks" and execArgv: ["--expose-gc"] to vitest config.',
    );
  }
});

describe('garbage collection', () => {
  // -----------------------------------------------------------------------
  // Disposed effects should be collectable
  // -----------------------------------------------------------------------

  it('disposed effect is garbage collected', async () => {
    const s = signal(0);
    let ref: WeakRef<object>;

    (() => {
      const e = effect(() => {
        void s.value;
      });
      ref = new WeakRef(e);
      e.dispose();
    })();

    await forceGC();
    expect(ref!.deref()).toBeUndefined();
  });

  it('effect that goes out of scope after dispose is collected', async () => {
    const s = signal(0);
    let ref: WeakRef<object>;

    (() => {
      const e = effect(() => {
        void s.value;
      });
      ref = new WeakRef(e);
      e.dispose();
    })();

    // Signal still exists, but disposed effect should not be retained
    s.value = 1;

    await forceGC();
    expect(ref!.deref()).toBeUndefined();
  });

  // -----------------------------------------------------------------------
  // Owner disposal frees effects
  // -----------------------------------------------------------------------

  it('effects owned by a disposed owner are garbage collected', async () => {
    const s = signal(0);
    let effectRef: WeakRef<object>;

    (() => {
      const owner = createOwner();

      runWithOwner(owner, () => {
        const e = effect(() => {
          void s.value;
        });
        effectRef = new WeakRef(e);
      });

      owner.dispose();
    })();

    await forceGC();
    expect(effectRef!.deref()).toBeUndefined();
  });

  it('disposed owner itself is garbage collected', async () => {
    let ownerRef: WeakRef<object>;

    (() => {
      const owner = createOwner();
      ownerRef = new WeakRef(owner);
      owner.dispose();
    })();

    await forceGC();
    expect(ownerRef!.deref()).toBeUndefined();
  });

  it('nested owners are all collected after root disposal', async () => {
    let rootRef: WeakRef<object>;
    let childRef: WeakRef<object>;
    let grandchildRef: WeakRef<object>;

    (() => {
      const root = createOwner();
      rootRef = new WeakRef(root);

      runWithOwner(root, () => {
        const child = createOwner();
        childRef = new WeakRef(child);

        runWithOwner(child, () => {
          const grandchild = createOwner();
          grandchildRef = new WeakRef(grandchild);
        });
      });

      root.dispose();
    })();

    await forceGC();
    expect(rootRef!.deref()).toBeUndefined();
    expect(childRef!.deref()).toBeUndefined();
    expect(grandchildRef!.deref()).toBeUndefined();
  });

  // -----------------------------------------------------------------------
  // Signals don't retain disposed observers
  // -----------------------------------------------------------------------

  it('signal does not retain a reference to a disposed effect', async () => {
    const s = signal(0);
    let ref: WeakRef<object>;

    (() => {
      const e = effect(() => {
        void s.value;
      });
      ref = new WeakRef(e);
      e.dispose();
    })();

    // Signal still alive — but should not hold the effect
    s.value = 1;
    s.value = 2;

    await forceGC();
    expect(ref!.deref()).toBeUndefined();
  });

  it('computed does not retain a reference to a disposed effect', async () => {
    const s = signal(0);
    const c = computed(() => s.value * 2);
    let ref: WeakRef<object>;

    (() => {
      const e = effect(() => {
        void c.value;
      });
      ref = new WeakRef(e);
      e.dispose();
    })();

    s.value = 1;

    await forceGC();
    expect(ref!.deref()).toBeUndefined();
  });

  // -----------------------------------------------------------------------
  // Cleanup callbacks are released after running
  // -----------------------------------------------------------------------

  it('effect cleanup function is released after disposal', async () => {
    const s = signal(0);
    let cleanupRef: WeakRef<object>;

    (() => {
      const cleanup = () => {};
      cleanupRef = new WeakRef(cleanup);

      const e = effect(() => {
        void s.value;
        return cleanup;
      });
      e.dispose();
    })();

    await forceGC();
    expect(cleanupRef!.deref()).toBeUndefined();
  });

  // -----------------------------------------------------------------------
  // Stress test — many effects don't leak
  // -----------------------------------------------------------------------

  it('creating and disposing many effects does not leak', async () => {
    const s = signal(0);
    const refs: WeakRef<object>[] = [];

    (() => {
      for (let i = 0; i < 1000; i++) {
        const e = effect(() => {
          void s.value;
        });
        refs.push(new WeakRef(e));
        e.dispose();
      }
    })();

    await forceGC();

    const alive = refs.filter((ref) => ref.deref() !== undefined).length;
    // Allow some tolerance — GC is non-deterministic
    expect(alive).toBeLessThan(50);
  });
});
