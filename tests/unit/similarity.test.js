import { describe, expect, it } from 'vitest';
import { cosine, nearestNeighbors, norm } from '../../src/similarity.js';

describe('vector helpers', () => {
  it('computes norms and cosine similarity', () => {
    expect(norm([3, 4])).toBe(5);
    expect(cosine([1, 0], [1, 0])).toBeCloseTo(1, 12);
    expect(cosine([1, 0], [0, 1])).toBeCloseTo(0, 12);
    expect(cosine([1, 0], [-1, 0])).toBeCloseTo(-1, 12);
    expect(cosine([0, 0], [1, 0])).toBe(0);
    expect(() => cosine([1], [1, 2])).toThrow(RangeError);
  });

  it('returns the k most similar other notes, most similar first', () => {
    const vectors = [
      [1, 0],
      [0.9, 0.1],
      [0, 1],
      [0.7, 0.7],
      [-1, 0],
    ];
    const result = nearestNeighbors(vectors, 0, 3);
    expect(result.map((r) => r.index)).toEqual([1, 3, 2]);
    expect(result.every((r) => r.index !== 0)).toBe(true);
    expect(result[0].similarity).toBeGreaterThan(result[1].similarity);
  });

  it('caps k at the number of other notes and rejects bad indexes', () => {
    expect(nearestNeighbors([[1], [1], [1]], 1, 5)).toHaveLength(2);
    expect(() => nearestNeighbors([[1]], 3, 1)).toThrow(RangeError);
  });
});
