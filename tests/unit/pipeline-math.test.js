import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { agglomerative, distinctCount, kRange, mergeSmallClusters, selectClustering, sphericalKMeans } from '../../src/pipeline/cluster.js';
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

describe('PCA against a reference implementation', () => {
  const ref = JSON.parse(readFileSync(new URL('../fixtures/pca-reference.json', import.meta.url), 'utf8'));
  for (const name of ['wide', 'tall']) {
    it(`matches numpy SVD within 1e-6 (${name}: Gram and covariance paths)`, () => {
      const { rows, k, scores, explainedVarianceRatio } = ref[name];
      const out = pca(rows, k);
      expect(out.components).toBe(k);
      expect(out.explainedVarianceRatio).toBeCloseTo(explainedVarianceRatio, 6);
      for (let c = 0; c < k; c += 1) {
        // Component signs are arbitrary: align each component once, then compare every point.
        const sign = Math.sign(out.projected[0][c]) === Math.sign(scores[0][c]) ? 1 : -1;
        for (let i = 0; i < rows.length; i += 1) {
          expect(Math.abs(sign * out.projected[i][c] - scores[i][c])).toBeLessThan(1e-6);
        }
      }
    });
  }
});

describe('silhouette', () => {
  it('matches a value computed by hand', () => {
    // Points at 0, 1 and 4 on a line embedded as unit vectors at those angles (degrees).
    const rad = (deg) => (deg * Math.PI) / 180;
    const pts = [0, 10, 90].map((d) => [Math.cos(rad(d)), Math.sin(rad(d))]);
    const d = (a, b) => 1 - Math.cos(rad(b - a));
    // Clusters {0, 10} and {90}: the singleton scores 0.
    const s0 = (d(0, 90) - d(0, 10)) / Math.max(d(0, 10), d(0, 90));
    const s1 = (d(10, 90) - d(0, 10)) / Math.max(d(0, 10), d(10, 90));
    expect(silhouette(pts, [0, 0, 1])).toBeCloseTo((s0 + s1 + 0) / 3, 12);
  });

  it('scores good, bad and single-cluster partitions sensibly', () => {
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

  it('with a tolerance, prefers the smallest k within it of the best silhouette', () => {
    const opts = { kMax: 6, minNotesPerTheme: 4, agglomerativeMaxN: 150, kmeansRuns: 5, kmeansMaxIter: 50 };
    const strict = selectClustering(rows, createRng(1), opts);
    const loose = selectClustering(rows, createRng(1), { ...opts, kTolerance: 2 }); // every score qualifies
    expect(loose.selected.k).toBe(2);
    expect(loose.selected.k).toBeLessThanOrEqual(strict.selected.k);
    const none = selectClustering(rows, createRng(1), { ...opts, kTolerance: 0 });
    expect(none.selected).toEqual(strict.selected);
  });

  it('skips agglomerative clustering above the size limit', () => {
    const res = selectClustering(rows, createRng(1), {
      kMax: 4, minNotesPerTheme: 4, agglomerativeMaxN: 10, kmeansRuns: 2, kmeansMaxIter: 20,
    });
    expect(res.skipAgglomerative).toBe(true);
    expect(res.scores.every((s) => s.algorithm === 'kmeans')).toBe(true);
  });

  it('converges quickly on duplicate notes and never uses more clusters than distinct points', () => {
    const dup = Array.from({ length: 200 }, (_, i) => (i % 4 === 0 ? [1, 0, 0] : i % 4 === 1 ? [0, 1, 0] : [0, 0, 1]));
    expect(distinctCount(dup)).toBe(3);
    const t = performance.now();
    const labels = sphericalKMeans(dup, 8, createRng(1), { runs: 30, maxIter: 100 });
    expect(performance.now() - t).toBeLessThan(2000);
    expect(Math.max(...labels) + 1).toBeLessThanOrEqual(3);
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
