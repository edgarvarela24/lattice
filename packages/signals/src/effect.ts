// @lattice/signals — Effect
import { getCurrentObserver, runWithObserver } from './observer';
import { runCleanups } from './observer-utils';
import type { Disposable, InternalEffect } from './types.js';

export function effect(fn: () => void): Disposable {
  let effect: InternalEffect;
  effect = {
    active: true,
    dispose: () => {
      effect.children.forEach((child) => child.dispose());
      effect.children.clear();
      runCleanups(effect.cleanups);
      effect.active = false;
    },
    cleanups: [],
    children: new Set(),
    notify: () => {
      if (effect.active) {
        effect.children.forEach((child) => child.dispose());
        effect.children.clear();
        runCleanups(effect.cleanups);
        runWithObserver(effect, fn);
      }
    },
  };
  runWithObserver(effect, fn);
  const currentObserver = getCurrentObserver();
  if (currentObserver) {
    currentObserver.children.add(effect);
  }
  return effect;
}
