import { describe, expect, it } from 'vitest';
import { createRng, randomInt } from '../../src/pipeline/rng.js';

describe('seeded random number generator', () => {
  it('produces the same sequence for the same seed', () => {
    const a = createRng(42);
    const b = createRng(42);
    const seqA = Array.from({ length: 100 }, a);
    const seqB = Array.from({ length: 100 }, b);
    expect(seqA).toEqual(seqB);
  });

  it('matches the reference mulberry32 output', () => {
    expect(createRng(0)()).toBe(0.26642920868471265);
  });

  it('produces different sequences for different seeds', () => {
    const a = Array.from({ length: 10 }, createRng(1));
    const b = Array.from({ length: 10 }, createRng(2));
    expect(a).not.toEqual(b);
  });

  it('returns values in [0, 1)', () => {
    const rng = createRng(7);
    for (let i = 0; i < 10_000; i += 1) {
      const v = rng();
      expect(v).toBeGreaterThanOrEqual(0);
      expect(v).toBeLessThan(1);
    }
  });

  it('draws integers in range and rejects bad input', () => {
    const rng = createRng(3);
    for (let i = 0; i < 1000; i += 1) {
      const v = randomInt(rng, 5);
      expect(Number.isInteger(v)).toBe(true);
      expect(v).toBeGreaterThanOrEqual(0);
      expect(v).toBeLessThan(5);
    }
    expect(() => randomInt(rng, 0)).toThrow(RangeError);
    expect(() => createRng(1.5)).toThrow(TypeError);
  });
});
