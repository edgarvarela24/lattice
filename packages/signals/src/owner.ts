import { runCleanups } from './observer-utils';
import { Owner } from './types';

const ownerStack: Owner[] = [];

export function createOwner(): Owner {
  let owner: Owner;
  owner = {
    active: true,
    cleanups: [],
    children: new Set(),
    dispose: function () {
      owner.children.forEach((child) => child.dispose());
      owner.children.clear();
      runCleanups(owner.cleanups);
      owner.active = false;
    },
  };
  const currentOwner = getCurrentOwner();
  if (currentOwner) {
    currentOwner.children.add(owner);
  }
  return owner;
}

export function runWithOwner<T>(owner: Owner, fn: () => T): T | undefined {
  if (!owner.active) return;
  ownerStack.push(owner);

  try {
    return fn();
  } finally {
    ownerStack.pop();
  }
}

export function getCurrentOwner(): Owner | undefined {
  return ownerStack.at(-1);
}
