#!/usr/bin/env node
// Compares two benchmark files: timings within ±25% of the first (or within
// 20 ms), label pass rates within ±10 percentage points. Usage: npm run bench:compare -- a.json b.json
import { readFileSync } from 'node:fs';
import { compareBenchmarks } from './lib/bench-compare.mjs';

const [a, b] = process.argv.slice(2).filter((x) => !x.startsWith('--'));
const result = compareBenchmarks(JSON.parse(readFileSync(a, 'utf8')), JSON.parse(readFileSync(b, 'utf8')));
for (const row of result.rows) console.log(`${row.ok ? 'ok  ' : 'FAIL'} ${row.metric}: ${row.a} vs ${row.b} (${row.rule})`);
console.log(result.ok ? 'within tolerance' : 'outside tolerance');
process.exit(result.ok ? 0 : 1);
