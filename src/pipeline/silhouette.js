// Mean silhouette score with cosine distance (1 - cosine similarity).
import { dot, unit } from './linalg.js';

/**
 * @param {ArrayLike<number>[]} rows
 * @param {number[]} labels cluster index per row (0..k-1)
 * @returns {number} mean silhouette in [-1, 1]; 0 when fewer than 2 clusters
 */
export function silhouette(rows, labels) {
  const n = rows.length;
  const k = Math.max(...labels) + 1;
  if (k < 2 || n < 2) return 0;
  const u = rows.map(unit);
  const sizes = new Array(k).fill(0);
  for (const l of labels) sizes[l] += 1;
  let total = 0;
  for (let i = 0; i < n; i += 1) {
    const sums = new Array(k).fill(0);
    for (let j = 0; j < n; j += 1) if (j !== i) sums[labels[j]] += 1 - dot(u[i], u[j]);
    const own = labels[i];
    if (sizes[own] <= 1) continue; // silhouette of a singleton is 0
    const a = sums[own] / (sizes[own] - 1);
    let b = Infinity;
    for (let c = 0; c < k; c += 1) if (c !== own && sizes[c] > 0) b = Math.min(b, sums[c] / sizes[c]);
    const m = Math.max(a, b);
    total += m === 0 ? 0 : (b - a) / m;
  }
  return total / n;
}
