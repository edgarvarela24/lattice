// @lattice/signals — Effect
import {
  getCurrentObserver,
  runWithObserver,
  startTrackingDependents,
  stopTrackingDependents,
} from './observer';
import { runCleanups } from './observer-utils';
import type { Disposable, InternalEffect, ReactiveSource } from './types.js';

export function effect(fn: () => void): Disposable {
  let _dependents: Map<ReactiveSource, number>;

  const tearDown = () => {
    effect.children.forEach((child) => child.dispose());
    effect.children.clear();
    runCleanups(effect.cleanups);
  };

  const run = () => {
    _dependents = startTrackingDependents();
    try {
      runWithObserver(effect, fn);
    } finally {
      stopTrackingDependents();
    }
  };

  let effect: InternalEffect;
  effect = {
    active: true,
    dispose: () => {
      tearDown();
      effect.active = false;
    },
    cleanups: [],
    children: new Set(),
    notify: () => {
      if (!effect.active) return;

      if (_dependents.size > 0) {
        let changed = false;
        for (const [dependent, version] of _dependents) {
          try {
            dependent.value;
          } catch {
            changed = true;
            break;
          }
          if (dependent._version !== version) {
            changed = true;
            break;
          }
        }
        if (!changed) return;
      }
      tearDown();
      run();
    },
  };

  run();

  const currentObserver = getCurrentObserver();
  if (currentObserver) {
    currentObserver.children.add(effect);
  }
  return effect;
}
