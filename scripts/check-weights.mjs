#!/usr/bin/env node
// Fails if any tracked file is a model weight file or larger than 10 MB.
// Model weights are downloaded at runtime from the model host and are never
// committed.
import { execFileSync } from 'node:child_process';
import { statSync } from 'node:fs';

const MAX_BYTES = 10 * 1024 * 1024;
const WEIGHT_EXT = /\.(onnx|bin|safetensors|pt|pth|ckpt|gguf|tflite)$/i;

const files = execFileSync('git', ['ls-files', '-z'], { encoding: 'utf8' })
  .split('\0')
  .filter(Boolean);

const problems = [];
for (const file of files) {
  if (WEIGHT_EXT.test(file)) problems.push(`${file}: model weight file`);
  let size;
  try {
    ({ size } = statSync(file));
  } catch {
    continue; // deleted in the working tree
  }
  if (size > MAX_BYTES) problems.push(`${file}: ${(size / 1048576).toFixed(1)} MB exceeds 10 MB`);
}

if (problems.length) {
  console.error(`check-weights: ${problems.length} problem(s)\n${problems.join('\n')}`);
  process.exit(1);
}
console.log(`check-weights: ${files.length} tracked files OK`);
