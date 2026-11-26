// Performance budgets from docs/adr/001-runtime.md, checked by the benchmark.
export const BUDGETS = Object.freeze({
  warmMs: 20_000, // warm run, demo sample, labels included
  coldMs: 90_000, // cold run including downloads at 50 Mbit/s
  downloadBytes: 300 * 1024 * 1024, // total model download
  peakMemoryBytes: 2 * 1024 ** 3, // reference laptop (the iPhone is measured by hand)
  longTaskMs: 200, // no main-thread task longer than this
  maxNotes: 500, // largest supported run
  maxNotesWarmMs: 40_000, // warm run at the maximum note count: 2 x the warm budget
});
export const THROTTLE_MBPS = 50;
