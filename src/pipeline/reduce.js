// Principal component analysis. Uses the n x n Gram matrix when there are
// fewer rows than dimensions (the usual case here), otherwise the d x d
// covariance matrix; both give the same projection.
import { mean, symmetricEigen } from './linalg.js';

/**
 * @param {ArrayLike<number>[]} rows n vectors of dimension d
 * @param {number} k number of components to keep
 * @returns {{ projected: Float64Array[], explainedVarianceRatio: number, components: number }}
 */
export function pca(rows, k) {
  const n = rows.length;
  const d = rows[0]?.length ?? 0;
  if (n < 2) throw new RangeError('pca needs at least two rows');
  const center = mean(rows);
  const x = rows.map((r) => Float64Array.from(r, (v, j) => v - center[j]));
  const kk = Math.max(1, Math.min(k, n - 1, d));
  let total = 0;
  for (const r of x) for (let j = 0; j < d; j += 1) total += r[j] * r[j];

  const projected = Array.from({ length: n }, () => new Float64Array(kk));
  let kept = 0;
  if (n <= d) {
    const gram = x.map((a) => Float64Array.from(x, (b) => dotRows(a, b)));
    const { values, vectors } = symmetricEigen(gram);
    for (let c = 0; c < kk; c += 1) {
      const lambda = Math.max(values[c], 0);
      kept += lambda;
      const s = Math.sqrt(lambda);
      for (let i = 0; i < n; i += 1) projected[i][c] = vectors[c][i] * s;
    }
  } else {
    const cov = Array.from({ length: d }, () => new Float64Array(d));
    for (const r of x) {
      for (let i = 0; i < d; i += 1) {
        const ri = r[i];
        if (ri === 0) continue;
        const row = cov[i];
        for (let j = i; j < d; j += 1) row[j] += ri * r[j];
      }
    }
    for (let i = 0; i < d; i += 1) for (let j = 0; j < i; j += 1) cov[i][j] = cov[j][i];
    const { values, vectors } = symmetricEigen(cov);
    for (let c = 0; c < kk; c += 1) {
      kept += Math.max(values[c], 0);
      for (let i = 0; i < n; i += 1) projected[i][c] = dotRows(x[i], vectors[c]);
    }
  }
  return { projected, explainedVarianceRatio: total > 0 ? kept / total : 0, components: kk };
}

function dotRows(a, b) {
  let s = 0;
  for (let i = 0; i < a.length; i += 1) s += a[i] * b[i];
  return s;
}
