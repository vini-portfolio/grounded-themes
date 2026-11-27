import { describe, expect, it } from 'vitest';
import { adjustedRandIndex, normalizedMutualInfo, stats } from '../../scripts/lib/metrics.mjs';

describe('clustering agreement metrics', () => {
  it('scores identical partitions 1, whatever the label names', () => {
    expect(adjustedRandIndex([0, 0, 1, 1, 2], ['a', 'a', 'b', 'b', 'c'])).toBeCloseTo(1, 12);
    expect(normalizedMutualInfo([0, 0, 1, 1, 2], ['a', 'a', 'b', 'b', 'c'])).toBeCloseTo(1, 12);
  });

  it('matches known reference values', () => {
    // Reference: sklearn.metrics.adjusted_rand_score([0,0,1,1],[0,0,1,2]) = 0.5714285714
    expect(adjustedRandIndex([0, 0, 1, 1], [0, 0, 1, 2])).toBeCloseTo(0.5714285714, 9);
    // sklearn.metrics.normalized_mutual_info_score([0,0,1,1],[0,0,1,2]) = 0.8 (arithmetic)
    expect(normalizedMutualInfo([0, 0, 1, 1], [0, 0, 1, 2])).toBeCloseTo(0.8, 9);
    // Independent partitions score about 0 (ARI can be negative).
    expect(adjustedRandIndex([0, 0, 1, 1], [0, 1, 0, 1])).toBeCloseTo(-0.5, 9);
  });

  it('summarizes values, ignoring missing ones', () => {
    expect(stats([1, 2, 3, null])).toEqual({ mean: 2, min: 1, max: 3, n: 3 });
    expect(stats([])).toEqual({ mean: null, min: null, max: null, n: 0 });
  });
});
