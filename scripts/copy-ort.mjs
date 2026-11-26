#!/usr/bin/env node
// Copies the ONNX Runtime WebAssembly files from node_modules into public/ort
// so the site serves them itself (they are not committed: see .gitignore).
import { copyFileSync, mkdirSync, statSync } from 'node:fs';
import { createRequire } from 'node:module';
import { dirname, join } from 'node:path';
import { ORT_FILES } from '../src/worker/runtime-config.js';

const require = createRequire(import.meta.url);
// The package's main entry lives in dist/, next to the WebAssembly files.
const dist = dirname(require.resolve('onnxruntime-web'));
const out = 'public/ort';
mkdirSync(out, { recursive: true });
let bytes = 0;
for (const file of ORT_FILES) {
  copyFileSync(join(dist, file), join(out, file));
  bytes += statSync(join(out, file)).size;
}
console.log(`copy-ort: ${ORT_FILES.length} files, ${(bytes / 1048576).toFixed(1)} MB -> ${out}/`);
