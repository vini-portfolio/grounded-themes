#!/usr/bin/env node
// Fails if a model weight file, a Git LFS pointer or any file over 10 MB is
// committed. Checks the working tree and, when a base ref is given, every blob
// added in the commits since that ref (so a large file added and later deleted
// in the same branch is still caught).
// Usage: node scripts/check-weights.mjs [--since <ref>]
import { execFileSync } from 'node:child_process';
import { lstatSync, openSync, readSync, closeSync } from 'node:fs';
import { checkFile } from './lib/weights.mjs';

const git = (...args) => execFileSync('git', args, { encoding: 'utf8', maxBuffer: 64 * 1024 * 1024 });
const sinceIdx = process.argv.indexOf('--since');
const since = sinceIdx > -1 ? process.argv[sinceIdx + 1] : null;

function head(path) {
  const buf = Buffer.alloc(64);
  const fd = openSync(path, 'r');
  try {
    const n = readSync(fd, buf, 0, 64, 0);
    return buf.subarray(0, n).toString('utf8');
  } finally {
    closeSync(fd);
  }
}

const problems = [];
const files = git('ls-files', '-z').split('\0').filter(Boolean);
for (const path of files) {
  let stat;
  try {
    stat = lstatSync(path);
  } catch {
    continue; // deleted in the working tree
  }
  if (!stat.isFile()) continue; // symlinks are not followed
  problems.push(...checkFile({ path, size: stat.size, head: head(path) }));
}

if (since) {
  const objects = git('rev-list', '--objects', `${since}..HEAD`).split('\n').filter((l) => l.includes(' '));
  for (const line of objects) {
    const [sha, ...rest] = line.split(' ');
    const path = rest.join(' ');
    if (git('cat-file', '-t', sha).trim() !== 'blob') continue;
    const size = Number(git('cat-file', '-s', sha).trim());
    const start = size > 0 ? git('cat-file', '-p', sha).slice(0, 64) : '';
    for (const p of checkFile({ path, size, head: start })) problems.push(`history ${sha.slice(0, 7)} ${p}`);
  }
}

const unique = [...new Set(problems)];
if (unique.length) {
  console.error(`check-weights: ${unique.length} problem(s)\n${unique.join('\n')}`);
  process.exit(1);
}
console.log(`check-weights: ${files.length} tracked files OK${since ? `, history since ${since} OK` : ''}`);
