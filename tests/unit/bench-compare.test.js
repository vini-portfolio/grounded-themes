import { describe, expect, it } from 'vitest';
import { compareBenchmarks } from '../../scripts/lib/bench-compare.mjs';

const s = (ms, first = 0) => ({
  totalMs: { mean: ms },
  stageMs: { embed: { mean: ms / 2 } },
  themes: { mean: 5 },
  labelFirstAttempt: { mean: first },
  labelAfterRetry: { mean: 0 },
});
const bench = (ms, first) => ({ datasets: { sample: { summary: s(ms, first) } } });

describe('benchmark comparison', () => {
  it('accepts timings within 25% and pass rates within 10 points', () => {
    expect(compareBenchmarks(bench(1000, 4), bench(1200, 4)).ok).toBe(true);
  });
  it('rejects a timing more than 25% apart', () => {
    const r = compareBenchmarks(bench(1000, 4), bench(1300, 4)); // 30% above the baseline
    expect(r.ok).toBe(false);
    expect(r.rows.find((x) => x.metric === 'sample warm total ms').ok).toBe(false);
  });
  it('treats differences under 20 ms as noise', () => {
    expect(compareBenchmarks(bench(8, 4), bench(20, 4)).ok).toBe(true); // +150% but 12 ms
    expect(compareBenchmarks(bench(8, 4), bench(40, 4)).ok).toBe(false); // 32 ms
  });

  it('fails when a dataset is missing from the second result', () => {
    const r = compareBenchmarks(bench(1000, 4), { datasets: {} });
    expect(r.ok).toBe(false);
  });

  it('rejects a label pass rate more than 10 points apart', () => {
    const r = compareBenchmarks(bench(1000, 5), bench(1000, 4)); // 100% vs 80%
    expect(r.rows.find((x) => x.metric === 'sample label pass rate').ok).toBe(false);
  });
});
