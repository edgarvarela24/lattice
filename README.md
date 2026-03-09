# Lattice

A compiled TypeScript framework built on fine-grained signals, deep reactive proxies, and compiled tagged templates.

**Status:** Pre-v1, active development. The signal engine ([`@lattice/signals`](packages/signals/)) is complete and tested. Deep reactive proxies and the compiler are next.

## What's Different

- **Signals as values** — a compiler transform lets you write `count++` instead of `count.set(count() + 1)`. Plain TypeScript, no special file formats.
- **Fine-grained reactivity, no virtual DOM** — one signal changes, one DOM node updates. Nothing else runs.
- **Deep reactive proxies** — nested object mutation is tracked at the path level, no manual immutability required.
- **Plain `.ts` files** — no `.svelte`, no `.jsx`, no custom language. Your components are TypeScript functions.

## Getting Started

```bash
pnpm install
pnpm build
```

## Documentation

The full framework design is in [`.spec.md`](.spec.md).

## ⚠️ Not Production Ready

This is a pre-v1 project under active development. APIs will change.
