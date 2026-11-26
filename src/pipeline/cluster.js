// Spherical k-means and agglomerative (average linkage, cosine) clustering,
// k selection by silhouette, and merging of small clusters.
import { dot, mean, unit } from './linalg.js';
import { randomInt } from './rng.js';
import { silhouette } from './silhouette.js';

/** Relabels clusters 0..k-1 in order of first appearance. */
export function relabel(labels) {
  const map = new Map();
  return labels.map((l) => {
    if (!map.has(l)) map.set(l, map.size);
    return map.get(l);
  });
}

function centroids(u, labels, k) {
  return Array.from({ length: k }, (_, c) => unit(mean(u, labels.flatMap((l, i) => (l === c ? [i] : [])))));
}

/**
 * Spherical k-means (cosine similarity on unit vectors), k-means++ seeding,
 * best of `runs` by total similarity to centroids.
 * @returns {number[]} labels
 */
/** Number of distinct vectors (exact duplicates counted once). */
export function distinctCount(rows) {
  return new Set(rows.map((r) => Array.prototype.join.call(r, ','))).size;
}

export function sphericalKMeans(rows, k, rng, { runs = 30, maxIter = 100 } = {}) {
  const u = rows.map(unit);
  const n = u.length;
  if (k >= n) return u.map((_, i) => i);
  // More clusters than distinct points can't converge: cap k.
  k = Math.min(k, distinctCount(u));
  let best = null;
  let bestScore = -Infinity;
  for (let run = 0; run < runs; run += 1) {
    // k-means++ seeding with distance 1 - cos
    const centers = [u[randomInt(rng, n)]];
    while (centers.length < k) {
      const dist = u.map((v) => Math.min(...centers.map((c) => 1 - dot(v, c))) ** 2);
      const sum = dist.reduce((a, b) => a + b, 0);
      let r = rng() * sum;
      let pick = n - 1;
      for (let i = 0; i < n; i += 1) {
        r -= dist[i];
        if (r <= 0) {
          pick = i;
          break;
        }
      }
      centers.push(u[pick]);
    }
    let labels = new Array(n).fill(-1);
    let cents = centers;
    for (let iter = 0; iter < maxIter; iter += 1) {
      const next = u.map((v) => {
        let bestC = 0;
        let bestS = -Infinity;
        for (let c = 0; c < k; c += 1) {
          const s = dot(v, cents[c]);
          if (s > bestS) {
            bestS = s;
            bestC = c;
          }
        }
        return bestC;
      });
      // Re-seed an empty cluster with the point farthest from its centroid,
      // taken only from a cluster that has more than one member.
      const sizes = new Array(k).fill(0);
      for (const l of next) sizes[l] += 1;
      for (let c = 0; c < k; c += 1) {
        if (sizes[c] > 0) continue;
        let far = -1;
        let farS = Infinity;
        next.forEach((l, i) => {
          if (sizes[l] < 2) return;
          const s = dot(u[i], cents[l]);
          if (s < farS) {
            farS = s;
            far = i;
          }
        });
        if (far < 0) break;
        sizes[next[far]] -= 1;
        next[far] = c;
        sizes[c] = 1;
      }
      const changed = next.some((l, i) => l !== labels[i]);
      labels = next;
      cents = centroids(u, labels, k);
      if (!changed) break;
    }
    const score = labels.reduce((s, l, i) => s + dot(u[i], cents[l]), 0);
    if (score > bestScore + 1e-12) {
      bestScore = score;
      best = labels;
    }
  }
  return relabel(best);
}

/**
 * Agglomerative clustering, average linkage on cosine distance. Returns a
 * function that cuts the tree at any k.
 */
export function agglomerative(rows) {
  const u = rows.map(unit);
  const n = u.length;
  const dist = Array.from({ length: n }, (_, i) => Float64Array.from(u, (v) => 1 - dot(u[i], v)));
  const members = Array.from({ length: n }, (_, i) => [i]);
  const active = new Set(members.keys());
  const merges = [];
  while (active.size > 1) {
    let bi = -1;
    let bj = -1;
    let bd = Infinity;
    const act = [...active];
    for (let x = 0; x < act.length; x += 1) {
      for (let y = x + 1; y < act.length; y += 1) {
        const dd = dist[act[x]][act[y]];
        if (dd < bd - 1e-15) {
          bd = dd;
          bi = act[x];
          bj = act[y];
        }
      }
    }
    const si = members[bi].length;
    const sj = members[bj].length;
    for (const o of active) {
      if (o === bi || o === bj) continue;
      const dd = (dist[bi][o] * si + dist[bj][o] * sj) / (si + sj);
      dist[bi][o] = dd;
      dist[o][bi] = dd;
    }
    members[bi] = members[bi].concat(members[bj]);
    active.delete(bj);
    merges.push([bi, bj]);
  }
  return function cut(k) {
    const owner = Array.from({ length: n }, (_, i) => i);
    const find = (i) => (owner[i] === i ? i : (owner[i] = find(owner[i])));
    for (let m = 0; m < n - k; m += 1) {
      const [a, b] = merges[m];
      owner[find(b)] = find(a);
    }
    return relabel(Array.from({ length: n }, (_, i) => find(i)));
  };
}

/** The evaluated k values: 2..min(kMax, floor(n / minPerTheme)). */
export function kRange(n, { kMax, minNotesPerTheme }) {
  const hi = Math.min(kMax, Math.floor(n / minNotesPerTheme));
  const out = [];
  for (let k = 2; k <= hi; k += 1) out.push(k);
  return out;
}

/**
 * Merges clusters smaller than minSize into the nearest other cluster by
 * centroid cosine similarity, smallest first.
 * @returns {{ labels: number[], merges: { from: number[], into: number[], similarity: number }[] }}
 *   merges list note indexes of the merged cluster and of its target
 */
export function mergeSmallClusters(rows, labels, minSize) {
  const u = rows.map(unit);
  let current = relabel(labels);
  const merges = [];
  for (;;) {
    const k = Math.max(...current) + 1;
    if (k < 2) break;
    const sizes = new Array(k).fill(0);
    for (const l of current) sizes[l] += 1;
    const small = sizes.map((s, c) => [s, c]).filter(([s]) => s < minSize).sort((a, b) => a[0] - b[0] || a[1] - b[1]);
    if (!small.length) break;
    const c = small[0][1];
    const cents = centroids(u, current, k);
    let target = -1;
    let bestS = -Infinity;
    for (let o = 0; o < k; o += 1) {
      if (o === c) continue;
      const s = dot(cents[c], cents[o]);
      if (s > bestS) {
        bestS = s;
        target = o;
      }
    }
    merges.push({
      from: current.flatMap((l, i) => (l === c ? [i] : [])),
      into: current.flatMap((l, i) => (l === target ? [i] : [])),
      similarity: bestS,
    });
    current = relabel(current.map((l) => (l === c ? target : l)));
  }
  return { labels: current, merges };
}

/**
 * Clusters rows for every k with both algorithms and picks the configuration
 * with the highest silhouette. Ties prefer k-means, then the smaller k.
 */
export function selectClustering(rows, rng, opts) {
  const { kMax, minNotesPerTheme, agglomerativeMaxN, kmeansRuns, kmeansMaxIter, kTolerance = 0 } = opts;
  const ks = kRange(rows.length, { kMax, minNotesPerTheme });
  const skipAgglomerative = rows.length > agglomerativeMaxN;
  const cut = skipAgglomerative || ks.length === 0 ? null : agglomerative(rows);
  const scores = [];
  const labelsBy = new Map();
  for (const k of ks) {
    const km = sphericalKMeans(rows, k, rng, { runs: kmeansRuns, maxIter: kmeansMaxIter });
    const effectiveK = Math.max(...km) + 1; // fewer than k when there are fewer distinct points
    if (effectiveK !== k) continue; // that k can't be realized; the smaller k is scored on its own
    scores.push({ algorithm: 'kmeans', k, silhouette: silhouette(rows, km) });
    labelsBy.set(`kmeans:${k}`, km);
    if (cut) {
      const ag = cut(k);
      scores.push({ algorithm: 'agglomerative', k, silhouette: silhouette(rows, ag) });
      labelsBy.set(`agglomerative:${k}`, ag);
    }
  }
  let selected = null;
  for (const s of scores) {
    if (
      !selected ||
      s.silhouette > selected.silhouette + 1e-12 ||
      (Math.abs(s.silhouette - selected.silhouette) <= 1e-12 &&
        ((s.algorithm === 'kmeans' && selected.algorithm !== 'kmeans') ||
          (s.algorithm === selected.algorithm && s.k < selected.k)))
    ) {
      selected = s;
    }
  }
  const best = selected;
  // Optional: prefer the smallest k whose silhouette is within kTolerance of the best.
  if (selected && kTolerance > 0) {
    const floor = selected.silhouette - kTolerance;
    const ok = scores.filter((s) => s.silhouette >= floor);
    // Smallest k first; at equal k the higher silhouette, then k-means on a tie.
    ok.sort(
      (a, b) =>
        a.k - b.k ||
        b.silhouette - a.silhouette ||
        (a.algorithm === 'kmeans' ? -1 : 1) - (b.algorithm === 'kmeans' ? -1 : 1),
    );
    selected = ok[0];
  }
  const labels = selected ? labelsBy.get(`${selected.algorithm}:${selected.k}`) : rows.map(() => 0);
  // Notes the two algorithms put in different groups at the selected k.
  let disagreements = [];
  if (selected && cut) {
    const other = labelsBy.get(`${selected.algorithm === 'kmeans' ? 'agglomerative' : 'kmeans'}:${selected.k}`);
    disagreements = disagreementIndexes(labels, other);
  }
  return { ks, scores, selected, best, kTolerance, labels, skipAgglomerative, disagreements };
}

/** Indexes whose cluster differs after matching clusters by largest overlap. */
export function disagreementIndexes(a, b) {
  const ka = Math.max(...a) + 1;
  const kb = Math.max(...b) + 1;
  const overlap = Array.from({ length: ka }, () => new Array(kb).fill(0));
  a.forEach((x, i) => (overlap[x][b[i]] += 1));
  const pairs = [];
  for (let i = 0; i < ka; i += 1) for (let j = 0; j < kb; j += 1) pairs.push([overlap[i][j], i, j]);
  pairs.sort((p, q) => q[0] - p[0] || p[1] - q[1] || p[2] - q[2]);
  const mapA = new Map();
  const usedB = new Set();
  for (const [, i, j] of pairs) {
    if (mapA.has(i) || usedB.has(j)) continue;
    mapA.set(i, j);
    usedB.add(j);
  }
  return a.flatMap((x, i) => (mapA.get(x) === b[i] ? [] : [i]));
}
