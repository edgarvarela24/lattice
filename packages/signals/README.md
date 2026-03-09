# @lattice/signals

Fine-grained reactive signal engine for Lattice. Platform-agnostic — no DOM dependency.

## API

### `signal(value)`

Reactive state container.

```typescript
const count = signal(0);
count.value++;              // write (notifies dependents)
console.log(count.value);   // read (tracked in effects/computeds)
console.log(count.peek());  // read (untracked, no dependency)
const unsub = count.subscribe((newVal, oldVal) => { ... });
```

### `computed(fn)`

Lazy, cached derivation. Only recomputes when dependencies change.

```typescript
const doubled = computed(() => count.value * 2);
console.log(doubled.value); // lazy — computed on first read
```

### `effect(fn)`

Auto-tracked side effect. Re-runs when any dependency changes. Return a function for cleanup.

```typescript
const e = effect(() => {
  console.log(count.value);
  return () => {
    /* runs before re-execution or on dispose */
  };
});
e.dispose();
```

### `batch(fn)`

Groups multiple signal writes into a single propagation pass.

```typescript
batch(() => {
  a.value = 1;
  b.value = 2;
}); // dependents notified once, not twice
```

### `untracked(fn)`

Reads signals inside `fn` without creating tracking dependencies.

```typescript
effect(() => {
  const tracked = count.value; // dependency
  const notTracked = untracked(() => other.value); // no dependency
});
```

### `createOwner()` / `runWithOwner(owner, fn)`

Ownership scopes for lifecycle management. Effects created inside `runWithOwner` are disposed when the owner is disposed.

```typescript
const owner = createOwner();
runWithOwner(owner, () => {
  effect(() => { ... }); // owned by `owner`
});
owner.dispose(); // disposes all owned effects and child owners
```

## Key Properties

- **Fine-grained updates** — only the specific effects that depend on a changed signal re-run.
- **Lazy evaluation** — computeds don't execute until their value is read.
- **Equality checking** — signals skip propagation when the new value equals the old value.
- **Version-based skip** — effects skip re-execution when their computed dependencies haven't actually changed, even if upstream signals fired.
- **Automatic ownership** — effects created inside an owner are automatically tracked and disposed with it.
- **Glitch-free** — diamond dependencies resolve consistently; effects never see intermediate states.
- **Circular detection** — circular computed dependencies throw immediately instead of looping.

## Build & Test

From the repo root:

```bash
pnpm install
pnpm build                # compiles to dist/
pnpm test                 # full test suite (218 tests)
pnpm test:gc              # garbage collection tests (requires --expose-gc)
```

## Demos

Build the browser bundle and serve the demos:

```bash
cd packages/signals && pnpm build
npx esbuild packages/signals/dist/index.js --bundle --format=esm --outfile=apps/demo/signals.js
npx serve apps/demo
```

- `localhost:3000` — technical dashboard (5 panels proving engine capabilities)
- `localhost:3000/fun.html` — interactive particle canvas (4 modes, all particle state driven by signals)

## Internals

`@lattice/signals/internals` exports observer tracking, owner management, and batch scheduling primitives. These are consumed by sibling packages (`@lattice/runtime`, `@lattice/compiler`) to build higher-level abstractions. Not intended for application code.
