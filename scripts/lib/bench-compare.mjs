// Rules for comparing two benchmark results (used by bench-compare.mjs and tests).
export const TIMING_TOLERANCE = 0.25;
export const RATE_TOLERANCE_POINTS = 10;

export function compareBenchmarks(a, b) {
  const rows = [];
  const timing = (metric, x, y) => {
    if (typeof x !== 'number' || typeof y !== 'number') return;
    const ok = Math.abs(y - x) <= TIMING_TOLERANCE * Math.max(x, y);
    rows.push({ metric, a: Math.round(x), b: Math.round(y), ok, rule: '±25%' });
  };
  const rate = (metric, x, y) => {
    if (typeof x !== 'number' || typeof y !== 'number') return;
    const ok = Math.abs(y - x) * 100 <= RATE_TOLERANCE_POINTS;
    rows.push({ metric, a: `${(x * 100).toFixed(1)}%`, b: `${(y * 100).toFixed(1)}%`, ok, rule: '±10 points' });
  };
  for (const name of Object.keys(a.datasets ?? {})) {
    const sa = a.datasets[name]?.summary;
    const sb = b.datasets?.[name]?.summary;
    if (!sa || !sb) continue;
    timing(`${name} total ms`, sa.totalMs.mean, sb.totalMs.mean);
    for (const stage of Object.keys(sa.stageMs)) timing(`${name} ${stage} ms`, sa.stageMs[stage].mean, sb.stageMs[stage]?.mean);
    const passRate = (s, themes) => (themes ? (s.labelFirstAttempt.mean + s.labelAfterRetry.mean) / themes : null);
    rate(`${name} label pass rate`, passRate(sa, sa.themes.mean), passRate(sb, sb.themes.mean));
  }
  timing('cold total ms', a.cold?.totalMs, b.cold?.totalMs);
  return { ok: rows.every((r) => r.ok), rows };
}
