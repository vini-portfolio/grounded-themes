#!/usr/bin/env node
// Validates the datasets in data/ against their documented shape.
import { readFileSync } from 'node:fs';
import { checkDataset, DATASET_RULES } from './lib/datasets.mjs';

let failed = false;
for (const [name, rules] of Object.entries(DATASET_RULES)) {
  const data = JSON.parse(readFileSync(`data/${name}.json`, 'utf8'));
  const problems = checkDataset(data, rules);
  console.log(`${name}: ${data.notes.length} notes ${problems.length ? 'FAIL' : 'OK'}`);
  for (const p of problems) console.error(`  ${p}`);
  failed ||= problems.length > 0;
}
process.exit(failed ? 1 : 0);
