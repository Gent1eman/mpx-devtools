import { describe, expect, it } from 'vitest';

import {
  CIRCULAR_MARKER,
  DEEP_MARKER,
  TRUNCATED_MARKER,
  TRUNCATED_OBJECT_KEY,
  safeSerialize,
  type SafeSerialized
} from './safe-serialize.js';

describe('safeSerialize', () => {
  it('serializes primitives', () => {
    expect(safeSerialize(null)).toBeNull();
    expect(safeSerialize(true)).toBe(true);
    expect(safeSerialize(42)).toBe(42);
    expect(safeSerialize('hello')).toBe('hello');
  });

  it('serializes plain objects and arrays', () => {
    expect(safeSerialize({ a: 1, b: 'x' })).toEqual({ a: 1, b: 'x' });
    expect(safeSerialize([1, 2, 3])).toEqual([1, 2, 3]);
  });

  it('does not throw on a circular reference and marks it', () => {
    const circular: { self?: unknown } = {};
    circular.self = circular;

    const result = safeSerialize(circular);

    expect(result).toEqual({ self: CIRCULAR_MARKER });
  });

  it('does not throw on mutual circular references', () => {
    const a: { b?: unknown } = {};
    const b: { a?: unknown } = {};
    a.b = b;
    b.a = a;

    const result = safeSerialize(a);

    expect(result).toEqual({ b: { a: CIRCULAR_MARKER } });
  });

  it('marks values beyond the max depth', () => {
    const value = { level1: { level2: { level3: { level4: { leaf: 'x' } } } } };

    const result = safeSerialize(value, { maxDepth: 3 });

    expect(result).toEqual({ level1: { level2: { level3: DEEP_MARKER } } });
  });

  it('truncates strings beyond the max length with a marker', () => {
    const longString = 'a'.repeat(100);

    const result = safeSerialize(longString, { maxStringLength: 10 });

    expect(result).toBe('aaaaaaaaaa…');
    expect(String(result).length).toBe(11);
  });

  it('truncates arrays and objects beyond their limits', () => {
    const bigArray = Array.from({ length: 10 }, (_, index) => index);
    const bigObject = Object.fromEntries(
      Array.from({ length: 10 }, (_, index) => [`k${index}`, index])
    );

    expect(safeSerialize(bigArray, { maxArrayLength: 3 })).toEqual([0, 1, 2, TRUNCATED_MARKER]);
    expect(safeSerialize(bigObject, { maxObjectKeys: 2 })).toEqual({
      k0: 0,
      k1: 1,
      [TRUNCATED_OBJECT_KEY]: TRUNCATED_MARKER
    });
  });

  it('serializes functions, symbols, undefined, and dates as markers or values', () => {
    const value: Record<string, unknown> = {
      fn: () => undefined,
      sym: Symbol('x'),
      undef: undefined,
      date: new Date('2026-01-01T00:00:00.000Z')
    };

    const result = safeSerialize(value) as Record<string, SafeSerialized>;

    expect(result.fn).toBe('[Function]');
    expect(result.sym).toBe('[Symbol]');
    expect(result.undef).toBe('[Undefined]');
    expect(result.date).toBe('2026-01-01T00:00:00.000Z');
  });

  it('marks non-finite numbers as strings', () => {
    expect(safeSerialize(Number.NaN)).toBe('NaN');
    expect(safeSerialize(Number.POSITIVE_INFINITY)).toBe('Infinity');
  });

  it('marks property reads that throw', () => {
    const value = {
      ok: 1,
      get bad() {
        throw new Error('boom');
      }
    };

    const result = safeSerialize(value);

    expect(result).toEqual({ ok: 1, bad: '[Error]' });
  });
});
