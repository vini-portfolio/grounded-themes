// Agreement between a clustering and ground-truth labels, and summary statistics.
const pairs = (x) => (x * (x - 1)) / 2;

function contingency(a, b) {
  const table = new Map(); // key -> { x, y, count }
  const ra = new Map();
  const rb = new Map();
  a.forEach((x, i) => {
    const y = b[i];
    const key = JSON.stringify([x, y]);
    const cell = table.get(key) ?? { x, y, count: 0 };
    cell.count += 1;
    table.set(key, cell);
    ra.set(x, (ra.get(x) ?? 0) + 1);
    rb.set(y, (rb.get(y) ?? 0) + 1);
  });
  return { table, ra, rb };
}

/** Adjusted Rand Index (Hubert and Arabie). */
export function adjustedRandIndex(a, b) {
  const { table, ra, rb } = contingency(a, b);
  const index = [...table.values()].reduce((s, c) => s + pairs(c.count), 0);
  const sa = [...ra.values()].reduce((s, v) => s + pairs(v), 0);
  const sb = [...rb.values()].reduce((s, v) => s + pairs(v), 0);
  const expected = (sa * sb) / pairs(a.length);
  const max = (sa + sb) / 2;
  return max === expected ? 0 : (index - expected) / (max - expected);
}

/** Normalized mutual information (arithmetic-mean normalization). */
export function normalizedMutualInfo(a, b) {
  const n = a.length;
  const { table, ra, rb } = contingency(a, b);
  const h = (m) => -[...m.values()].reduce((s, v) => s + (v / n) * Math.log(v / n), 0);
  let mi = 0;
  for (const { x, y, count } of table.values()) {
    mi += (count / n) * Math.log((count * n) / (ra.get(x) * rb.get(y)));
  }
  const ha = h(ra);
  const hb = h(rb);
  return ha + hb === 0 ? 0 : (2 * mi) / (ha + hb);
}

/** { mean, min, max, n } of a list of numbers (nulls ignored). */
export function stats(values) {
  const v = values.filter((x) => typeof x === 'number' && Number.isFinite(x));
  if (!v.length) return { mean: null, min: null, max: null, n: 0 };
  return { mean: v.reduce((s, x) => s + x, 0) / v.length, min: Math.min(...v), max: Math.max(...v), n: v.length };
}
