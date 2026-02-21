import { describe, it, expect, vi } from 'vitest';
import { signal } from '../src/index.js';

describe('signal', () => {
  // -----------------------------------------------------------------------
  // Creation & Reading
  // -----------------------------------------------------------------------

  it('holds its initial value', () => {
    const count = signal(0);
    expect(count.value).toBe(0);
  });

  it('holds non-zero initial values', () => {
    const name = signal('hello');
    expect(name.value).toBe('hello');
  });

  it('can hold null', () => {
    const value = signal<string | null>(null);
    expect(value.value).toBe(null);
  });

  it('can hold undefined', () => {
    const value = signal<number | undefined>(undefined);
    expect(value.value).toBe(undefined);
  });

  it('can hold objects', () => {
    const obj = { a: 1, b: 2 };
    const value = signal(obj);
    expect(value.value).toBe(obj);
  });

  it('can hold arrays', () => {
    const arr = [1, 2, 3];
    const value = signal(arr);
    expect(value.value).toBe(arr);
  });

  // -----------------------------------------------------------------------
  // Writing
  // -----------------------------------------------------------------------

  it('updates its value when written to', () => {
    const count = signal(0);
    count.value = 5;
    expect(count.value).toBe(5);
  });

  it('can be written multiple times', () => {
    const count = signal(0);
    count.value = 1;
    count.value = 2;
    count.value = 3;
    expect(count.value).toBe(3);
  });

  it('can be set to null', () => {
    const value = signal<string | null>('hello');
    value.value = null;
    expect(value.value).toBe(null);
  });

  it('can be set to undefined', () => {
    const value = signal<number | undefined>(42);
    value.value = undefined;
    expect(value.value).toBe(undefined);
  });

  // -----------------------------------------------------------------------
  // Peek (read without subscribing — same as .value for now,
  // but will matter once auto-tracking exists)
  // -----------------------------------------------------------------------

  it('peek returns the current value', () => {
    const count = signal(10);
    expect(count.peek()).toBe(10);
  });

  it('peek reflects writes', () => {
    const count = signal(0);
    count.value = 42;
    expect(count.peek()).toBe(42);
  });

  // -----------------------------------------------------------------------
  // Subscriber notification
  // -----------------------------------------------------------------------

  it('notifies subscribers when value changes', () => {
    const count = signal(0);
    const subscriber = vi.fn();

    count.subscribe(subscriber);
    count.value = 1;

    expect(subscriber).toHaveBeenCalledTimes(1);
  });

  it('passes the new and old value to subscribers', () => {
    const count = signal(0);
    const subscriber = vi.fn();

    count.subscribe(subscriber);
    count.value = 5;

    expect(subscriber).toHaveBeenCalledWith(5, 0);
  });

  it('notifies multiple subscribers', () => {
    const count = signal(0);
    const sub1 = vi.fn();
    const sub2 = vi.fn();
    const sub3 = vi.fn();

    count.subscribe(sub1);
    count.subscribe(sub2);
    count.subscribe(sub3);
    count.value = 1;

    expect(sub1).toHaveBeenCalledTimes(1);
    expect(sub2).toHaveBeenCalledTimes(1);
    expect(sub3).toHaveBeenCalledTimes(1);
  });

  it('notifies on each change', () => {
    const count = signal(0);
    const subscriber = vi.fn();

    count.subscribe(subscriber);
    count.value = 1;
    count.value = 2;
    count.value = 3;

    expect(subscriber).toHaveBeenCalledTimes(3);
  });

  // -----------------------------------------------------------------------
  // Equality check — no notification if value hasn't changed
  // -----------------------------------------------------------------------

  it('does not notify when set to the same value', () => {
    const count = signal(5);
    const subscriber = vi.fn();

    count.subscribe(subscriber);
    count.value = 5;

    expect(subscriber).not.toHaveBeenCalled();
  });

  it('uses Object.is for equality by default', () => {
    const count = signal(NaN);
    const subscriber = vi.fn();

    count.subscribe(subscriber);
    count.value = NaN; // Object.is(NaN, NaN) is true

    expect(subscriber).not.toHaveBeenCalled();
  });

  it('distinguishes +0 and -0 (Object.is(+0, -0) is false)', () => {
    const value = signal(+0);
    const subscriber = vi.fn();

    value.subscribe(subscriber);
    value.value = -0;

    expect(subscriber).toHaveBeenCalledTimes(1);
  });

  it('does not use deep equality — same reference means no notification', () => {
    const obj = { a: 1 };
    const value = signal(obj);
    const subscriber = vi.fn();

    value.subscribe(subscriber);
    value.value = obj; // same reference

    expect(subscriber).not.toHaveBeenCalled();
  });

  it('notifies when set to a different object with same shape', () => {
    const value = signal({ a: 1 });
    const subscriber = vi.fn();

    value.subscribe(subscriber);
    value.value = { a: 1 }; // different reference

    expect(subscriber).toHaveBeenCalledTimes(1);
  });

  // -----------------------------------------------------------------------
  // Custom equality
  // -----------------------------------------------------------------------

  it('supports a custom equality function', () => {
    const value = signal({ id: 1, name: 'Alice' }, { equals: (a, b) => a.id === b.id });
    const subscriber = vi.fn();

    value.subscribe(subscriber);
    value.value = { id: 1, name: 'Bob' }; // same id → treated as equal

    expect(subscriber).not.toHaveBeenCalled();
  });

  it('custom equality that always returns false triggers on every write', () => {
    const value = signal(0, { equals: () => false });
    const subscriber = vi.fn();

    value.subscribe(subscriber);
    value.value = 0; // same value, but equals says "not equal"

    expect(subscriber).toHaveBeenCalledTimes(1);
  });

  // -----------------------------------------------------------------------
  // Unsubscribe
  // -----------------------------------------------------------------------

  it('subscribe returns an unsubscribe function', () => {
    const count = signal(0);
    const subscriber = vi.fn();

    const unsubscribe = count.subscribe(subscriber);
    expect(typeof unsubscribe).toBe('function');
  });

  it('unsubscribed callback is not notified', () => {
    const count = signal(0);
    const subscriber = vi.fn();

    const unsubscribe = count.subscribe(subscriber);
    unsubscribe();
    count.value = 1;

    expect(subscriber).not.toHaveBeenCalled();
  });

  it('unsubscribing one does not affect others', () => {
    const count = signal(0);
    const sub1 = vi.fn();
    const sub2 = vi.fn();

    const unsub1 = count.subscribe(sub1);
    count.subscribe(sub2);

    unsub1();
    count.value = 1;

    expect(sub1).not.toHaveBeenCalled();
    expect(sub2).toHaveBeenCalledTimes(1);
  });

  it('unsubscribing twice is a no-op', () => {
    const count = signal(0);
    const subscriber = vi.fn();

    const unsubscribe = count.subscribe(subscriber);
    unsubscribe();
    unsubscribe(); // should not throw

    count.value = 1;
    expect(subscriber).not.toHaveBeenCalled();
  });

  // -----------------------------------------------------------------------
  // Edge cases
  // -----------------------------------------------------------------------

  it('works with zero subscribers', () => {
    const count = signal(0);
    count.value = 1; // should not throw
    expect(count.value).toBe(1);
  });

  it('subscriber added after a write only sees future changes', () => {
    const count = signal(0);
    count.value = 1;

    const subscriber = vi.fn();
    count.subscribe(subscriber);

    expect(subscriber).not.toHaveBeenCalled();

    count.value = 2;
    expect(subscriber).toHaveBeenCalledTimes(1);
  });

  it('reading inside a subscriber gives the new value', () => {
    const count = signal(0);
    let readValue: number | undefined;

    count.subscribe(() => {
      readValue = count.value;
    });

    count.value = 7;
    expect(readValue).toBe(7);
  });

  it('can hold a function as its value', () => {
    const fn = () => 'hello';
    const value = signal(fn);
    expect(value.value).toBe(fn);
    expect(value.value()).toBe('hello');
  });

  it('multiple signals are independent', () => {
    const a = signal(1);
    const b = signal(2);

    const subA = vi.fn();
    const subB = vi.fn();

    a.subscribe(subA);
    b.subscribe(subB);

    a.value = 10;

    expect(subA).toHaveBeenCalledTimes(1);
    expect(subB).not.toHaveBeenCalled();
    expect(a.value).toBe(10);
    expect(b.value).toBe(2);
  });
});
