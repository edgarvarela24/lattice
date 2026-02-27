// @lattice/signals — Effect
import { getCurrentTracker, runWithTracker } from './tracking';
import type { Disposable, Effect } from './types.js';

export function effect(fn: () => void): Disposable {
  let effect: Effect;
  effect = {
    active: true,
    dispose: () => {
      effect.children.forEach((child) => child.dispose());
      effect.children.clear();
      effect.cleanups.forEach((cleanup) => cleanup());
      effect.cleanups.length = 0;
      effect.active = false;
    },
    cleanups: [],
    children: new Set(),
    notify: () => {
      if (effect.active) {
        effect.children.forEach((child) => child.dispose());
        effect.children.clear();
        effect.cleanups.forEach((cleanup) => cleanup());
        effect.cleanups.length = 0;
        runWithTracker(effect, fn);
      }
    },
  };
  runWithTracker(effect, fn);
  const currentTracker = getCurrentTracker();
  if (currentTracker) {
    currentTracker.children.add(effect);
  }
  return effect;
}
