// @lattice/signals — Effect
import { runWithTracker } from './tracking';
import type { Disposable, Effect } from './types.js';

export function effect(fn: () => void): Disposable {
  let effect: Effect;
  effect = {
    active: true,
    dispose: () => {
      effect.cleanups.forEach((cleanup) => cleanup());
      effect.cleanups.length = 0;
      effect.active = false;
    },
    cleanups: [],
    notify: () => {
      if (effect.active) {
        effect.cleanups.forEach((cleanup) => cleanup());
        effect.cleanups.length = 0;
        runWithTracker(effect, fn);
      }
    },
  };
  runWithTracker(effect, fn);
  return effect;
}
