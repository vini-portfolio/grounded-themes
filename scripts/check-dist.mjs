#!/usr/bin/env node
// Checks the production build: no test-only fault hooks, no third-party script
// URLs for the runtime, and the ONNX Runtime files present.
import { existsSync, readdirSync, readFileSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { ORT_FILES } from '../src/worker/runtime-config.js';

const dist = process.argv[2] ?? 'dist';
const problems = [];
const walk = (dir) =>
  readdirSync(dir).flatMap((f) => (statSync(join(dir, f)).isDirectory() ? walk(join(dir, f)) : [join(dir, f)]));
for (const file of walk(dist).filter((f) => /\.(js|mjs|html)$/.test(f))) {
  const text = readFileSync(file, 'utf8');
  if (text.includes('gt-fault-hook') || text.includes('__gtInjectFault') || text.includes('__gtExperiment')) problems.push(`${file}: contains test-only fault hooks`);
}
for (const file of ORT_FILES) if (!existsSync(join(dist, 'ort', file))) problems.push(`missing ${dist}/ort/${file}`);
if (problems.length) {
  console.error(problems.join('\n'));
  process.exit(1);
}
console.log(`check-dist: ${dist} OK`);
