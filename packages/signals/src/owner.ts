import { OwnerImpl } from './owner-impl.js';
import type { Owner } from './types.js';

const ownerStack: Owner[] = [];

export function createOwner(): Owner {
  const owner = new OwnerImpl();
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
