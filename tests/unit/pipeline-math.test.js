import { describe, expect, it } from 'vitest';
import { agglomerative, kRange, mergeSmallClusters, selectClustering, sphericalKMeans } from '../../src/pipeline/cluster.js';
import { pca } from '../../src/pipeline/reduce.js';
import { createRng } from '../../src/pipeline/rng.js';
import { silhouette } from '../../src/pipeline/silhouette.js';
import { symmetricEigen } from '../../src/pipeline/linalg.js';
import { samePartition, syntheticClusters } from './helpers/bow-embed.js';

describe('eigen-decomposition', () => {
  it('satisfies A v = lambda v and sorts values descending', () => {
    const a = [
      [4, 1, 2],
      [1, 3, 0],
      [2, 0, 5],
    ];
    const { values, vectors } = symmetricEigen(a);
    expect(values[0]).toBeGreaterThanOrEqual(values[1]);
    for (let k = 0; k < 3; k += 1) {
      for (let i = 0; i < 3; i += 1) {
        const av = a[i].reduce((s, x, j) => s + x * vectors[k][j], 0);
        expect(av).toBeCloseTo(values[k] * vectors[k][i], 10);
      }
    }
  });
});

describe('principal component analysis', () => {
  it('keeps all variance for points on a line', () => {
    const rows = [0, 1, 2, 3, 4].map((t) => [t, 2 * t, -t]);
    const { explainedVarianceRatio, components, projected } = pca(rows, 2);
    expect(components).toBe(2);
    expect(explainedVarianceRatio).toBeCloseTo(1, 10);
    expect(projected).toHaveLength(5);
  });

  it('gives the same projection through the Gram and covariance paths', () => {
    const rng = createRng(5);
    const rows = Array.from({ length: 12 }, () => Array.from({ length: 20 }, () => rng()));
    // n = 12 <= d = 20 uses the Gram matrix. Repeating the rows four times keeps
    // the same distribution with n = 48 > d, which uses the covariance matrix.
    const viaGram = pca(rows, 3);
    const viaCov = pca([...rows, ...rows, ...rows, ...rows], 3);
    expect(viaGram.explainedVarianceRatio).toBeGreaterThan(0);
    expect(viaGram.explainedVarianceRatio).toBeLessThanOrEqual(1);
    expect(viaCov.explainedVarianceRatio).toBeCloseTo(viaGram.explainedVarianceRatio, 6);
    for (let i = 0; i < rows.length; i += 1) {
      for (let c = 0; c < 3; c += 1) {
        // Component signs may differ between the two paths.
        expect(Math.abs(viaCov.projected[i][c])).toBeCloseTo(Math.abs(viaGram.projected[i][c]), 6);
      }
    }
  });
});

describe('silhouette', () => {
  it('matches a hand-computed value', () => {
    // Two tight pairs pointing in opposite-ish directions.
    const rows = [
      [1, 0],
      [0.99, 0.1],
      [0, 1],
      [0.1, 0.99],
    ];
    const s = silhouette(rows, [0, 0, 1, 1]);
    expect(s).toBeGreaterThan(0.8);
    expect(silhouette(rows, [0, 1, 0, 1])).toBeLessThan(0);
    expect(silhouette(rows, [0, 0, 0, 0])).toBe(0);
  });
});

describe('clustering', () => {
  const { rows, truth } = syntheticClusters({ k: 3, m: 10 });

  it('spherical k-means recovers well-separated clusters, deterministically', () => {
    const a = sphericalKMeans(rows, 3, createRng(1), { runs: 5 });
    const b = sphericalKMeans(rows, 3, createRng(1), { runs: 5 });
    expect(samePartition(a, truth)).toBe(true);
    expect(a).toEqual(b);
  });

  it('agglomerative clustering recovers them too', () => {
    expect(samePartition(agglomerative(rows)(3), truth)).toBe(true);
  });

  it('evaluates k from 2 to min(K_MAX, n / MIN_NOTES_PER_THEME)', () => {
    expect(kRange(50, { kMax: 12, minNotesPerTheme: 4 })).toEqual([2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12]);
    expect(kRange(20, { kMax: 12, minNotesPerTheme: 4 })).toEqual([2, 3, 4, 5]);
    expect(kRange(7, { kMax: 12, minNotesPerTheme: 4 })).toEqual([]);
  });

  it('selects the configuration with the highest silhouette', () => {
    const res = selectClustering(rows, createRng(1), {
      kMax: 6, minNotesPerTheme: 4, agglomerativeMaxN: 150, kmeansRuns: 5, kmeansMaxIter: 50,
    });
    const best = Math.max(...res.scores.map((s) => s.silhouette));
    expect(res.selected.silhouette).toBe(best);
    expect(res.selected.k).toBe(3);
    expect(res.scores.some((s) => s.algorithm === 'agglomerative')).toBe(true);
    expect(res.skipAgglomerative).toBe(false);
  });

  it('skips agglomerative clustering above the size limit', () => {
    const res = selectClustering(rows, createRng(1), {
      kMax: 4, minNotesPerTheme: 4, agglomerativeMaxN: 10, kmeansRuns: 2, kmeansMaxIter: 20,
    });
    expect(res.skipAgglomerative).toBe(true);
    expect(res.scores.every((s) => s.algorithm === 'kmeans')).toBe(true);
  });

  it('merges clusters below the minimum size into the nearest cluster and records it', () => {
    const labels = [...truth];
    labels[0] = 3; // a singleton cut from cluster 0
    const { labels: merged, merges } = mergeSmallClusters(rows, labels, 3);
    expect(Math.max(...merged) + 1).toBe(3);
    expect(samePartition(merged, truth)).toBe(true);
    expect(merges).toHaveLength(1);
    expect(merges[0].from).toEqual([0]);
  });
});
