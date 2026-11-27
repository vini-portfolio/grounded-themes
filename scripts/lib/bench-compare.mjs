// Rules for comparing two benchmark results (used by bench-compare.mjs and tests).
// a is the baseline; b must be within the tolerances of a.
export const TIMING_TOLERANCE = 0.25;
// Differences under this many milliseconds are timer noise, whatever the ratio
// (stages that take a few milliseconds can't meet a ±25% rule).
export const TIMING_FLOOR_MS = 20;
export const RATE_TOLERANCE_POINTS = 10;

export function compareBenchmarks(a, b) {
  const rows = [];
  const timing = (metric, x, y) => {
    if (typeof x !== 'number') return;
    if (typeof y !== 'number') {
      rows.push({ metric, a: Math.round(x), b: 'missing', ok: false, rule: '±25%' });
      return;
    }
    const ok = Math.abs(y - x) <= Math.max(TIMING_TOLERANCE * x, TIMING_FLOOR_MS);
    rows.push({ metric, a: Math.round(x), b: Math.round(y), ok, rule: '±25% of baseline (or within 20 ms)' });
  };
  const rate = (metric, x, y) => {
    if (typeof x !== 'number' || typeof y !== 'number') return;
    const ok = Math.abs(y - x) * 100 <= RATE_TOLERANCE_POINTS;
    rows.push({ metric, a: `${(x * 100).toFixed(1)}%`, b: `${(y * 100).toFixed(1)}%`, ok, rule: '±10 points' });
  };
  const passRate = (s) => (s?.themes?.mean ? (s.labelFirstAttempt.mean + s.labelAfterRetry.mean) / s.themes.mean : null);
  for (const name of Object.keys(a.datasets ?? {})) {
    const da = a.datasets[name];
    const db = b.datasets?.[name];
    if (!db) {
      rows.push({ metric: `${name} dataset`, a: 'present', b: 'missing', ok: false, rule: 'same datasets' });
      continue;
    }
    timing(`${name} warm total ms`, da.summary.totalMs.mean, db.summary.totalMs.mean);
    timing(`${name} warm model load ms`, da.summary.loadMs?.mean, db.summary.loadMs?.mean);
    for (const stage of Object.keys(da.summary.stageMs)) {
      timing(`${name} warm ${stage} ms`, da.summary.stageMs[stage].mean, db.summary.stageMs?.[stage]?.mean);
    }
    if (da.cold) timing(`${name} cold total ms`, da.cold.summary.totalMs.mean, db.cold?.summary.totalMs.mean);
    rate(`${name} label pass rate`, passRate(da.summary), passRate(db.summary));
  }
  if (a.maxNotes) timing('max notes total ms', a.maxNotes.totalMs, b.maxNotes?.totalMs);
  return { ok: rows.every((r) => r.ok), rows };
}
