import { EffectImpl } from './effect-impl.js';
import type { Disposable } from './types.js';

export function effect(fn: () => void | (() => void)): Disposable {
  return new EffectImpl(fn);
}
