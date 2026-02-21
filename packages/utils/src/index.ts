// @lattice/utils — Shared TypeScript utility types

/**
 * Expands a type's properties into a readable, flat structure.
 * Useful for improving hover tooltips and type display in IDEs.
 */
export type Prettify<T> = {
  [K in keyof T]: T[K];
} & {};
