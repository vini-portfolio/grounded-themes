// Agreement between a clustering and ground-truth labels.
const pairs = (x) => (x * (x - 1)) / 2;

function contingency(a, b) {
  const table = new Map();
  const ra = new Map();
  const rb = new Map();
  a.forEach((x, i) => {
    const key = `${x}|${b[i]}`;
    table.set(key, (table.get(key) ?? 0) + 1);
    ra.set(x, (ra.get(x) ?? 0) + 1);
    rb.set(b[i], (rb.get(b[i]) ?? 0) + 1);
  });
  return { table, ra, rb };
}

export function adjustedRandIndex(a, b) {
  const { table, ra, rb } = contingency(a, b);
  const index = [...table.values()].reduce((s, v) => s + pairs(v), 0);
  const sa = [...ra.values()].reduce((s, v) => s + pairs(v), 0);
  const sb = [...rb.values()].reduce((s, v) => s + pairs(v), 0);
  const expected = (sa * sb) / pairs(a.length);
  const max = (sa + sb) / 2;
  return max === expected ? 0 : (index - expected) / (max - expected);
}

export function normalizedMutualInfo(a, b) {
  const n = a.length;
  const { table, ra, rb } = contingency(a, b);
  const h = (m) => -[...m.values()].reduce((s, v) => s + (v / n) * Math.log(v / n), 0);
  let mi = 0;
  for (const [key, v] of table) {
    const [x, y] = key.split('|');
    mi += (v / n) * Math.log((v * n) / (ra.get(Number(x)) * rb.get(y)));
  }
  const ha = h(ra);
  const hb = h(rb);
  return ha + hb === 0 ? 0 : (2 * mi) / (ha + hb);
}
