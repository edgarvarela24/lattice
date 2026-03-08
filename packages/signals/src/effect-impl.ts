import {
  getCurrentObserver,
  runWithObserver,
  startTrackingSources,
  stopTrackingSources,
} from './observer.js';
import { runCleanups } from './observer-utils.js';
import { getCurrentOwner } from './owner.js';
import type { Observer, Owner, ReactiveSource } from './types.js';

export class EffectImpl implements Observer {
  active = true;
  cleanups: (() => void)[] = [];
  children = new Set<Owner>();
  _sources!: Map<ReactiveSource, number>;
  _fn: () => void | (() => void);

  constructor(fn: () => void | (() => void)) {
    this._fn = fn;
    this.notify = this.notify.bind(this);
    this._run();

    const currentObserver = getCurrentObserver();
    if (currentObserver) {
      currentObserver.children.add(this);
    } else {
      const currentOwner = getCurrentOwner();
      if (currentOwner) {
        currentOwner.children.add(this);
      }
    }
  }

  _tearDown() {
    this.children.forEach((child) => child.dispose());
    this.children.clear();
    runCleanups(this.cleanups);
  }

  _run() {
    this._sources = startTrackingSources();
    try {
      const returnVal = runWithObserver(this, this._fn);
      if (typeof returnVal === 'function') this.cleanups.push(returnVal);
    } finally {
      stopTrackingSources();
    }
  }

  dispose() {
    this._tearDown();
    this.active = false;
  }

  notify() {
    if (!this.active) return;

    if (this._sources.size > 0) {
      let changed = false;
      for (const [source, version] of this._sources) {
        try {
          source.value;
        } catch {
          changed = true;
          break;
        }
        if (source._version !== version) {
          changed = true;
          break;
        }
      }
      if (!changed) return;
    }
    this._tearDown();
    this._run();
  }
}
