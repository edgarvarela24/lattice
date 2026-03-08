import { runCleanups } from './observer-utils.js';
import type { Owner } from './types.js';

export class OwnerImpl implements Owner {
  active = true;
  cleanups: (() => void)[] = [];
  children = new Set<Owner>();

  dispose() {
    this.children.forEach((child) => child.dispose());
    this.children.clear();
    runCleanups(this.cleanups);
    this.active = false;
  }
}
