import { describe, expect, it } from 'vitest';
import { compareBenchmarks } from '../../scripts/lib/bench-compare.mjs';

const s = (ms, first = 0) => ({
  totalMs: { mean: ms },
  stageMs: { embed: { mean: ms / 2 } },
  themes: { mean: 5 },
  labelFirstAttempt: { mean: first },
  labelAfterRetry: { mean: 0 },
});
const bench = (ms, first, cold) => ({ datasets: { sample: { summary: s(ms, first) } }, cold: { totalMs: cold } });

describe('benchmark comparison', () => {
  it('accepts timings within 25% and pass rates within 10 points', () => {
    expect(compareBenchmarks(bench(1000, 4), bench(1200, 4), 0).ok).toBe(true);
  });
  it('rejects a timing more than 25% apart', () => {
    const r = compareBenchmarks(bench(1000, 4, 5000), bench(1400, 4, 5000));
    expect(r.ok).toBe(false);
    expect(r.rows.find((x) => x.metric === 'sample total ms').ok).toBe(false);
  });
  it('rejects a label pass rate more than 10 points apart', () => {
    const r = compareBenchmarks(bench(1000, 5), bench(1000, 4)); // 100% vs 80%
    expect(r.rows.find((x) => x.metric === 'sample label pass rate').ok).toBe(false);
  });
});
