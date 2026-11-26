#!/usr/bin/env node
// Headless benchmark: runs the pipeline on every dataset in a real browser and
// writes docs/benchmarks/<name>.json and <name>.md with timings, download size,
// memory, long tasks, clustering quality and budget verdicts.
//
// Usage: npm run bench -- [--runs N] [--name NAME] [--reference] [--no-build] [--datasets a,b]
//   --runs N       warm runs per dataset (default 3); run i uses seed 42 + i
//   --reference    mark the result as measured on the reference setup (docs/adr/001-runtime.md)
//   --name NAME    output file name (default: <date>-<platform>)
import { execFileSync, spawn } from 'node:child_process';
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import os from 'node:os';
import { chromium } from '@playwright/test';
import { BUDGETS, THROTTLE_MBPS } from './lib/budgets.mjs';
import { adjustedRandIndex, normalizedMutualInfo, stats } from './lib/metrics.mjs';
import { EMBEDDING_MODEL } from '../src/worker/runtime-config.js';
import * as C from '../src/pipeline/constants.js';

const args = process.argv.slice(2);
const opt = (name, fallback) => {
  const i = args.indexOf(`--${name}`);
  return i > -1 ? args[i + 1] : fallback;
};
const RUNS = Number(opt('runs', 3));
// --option key=value (repeatable): pipeline options to try instead of the constants.
const PIPELINE_OPTIONS = Object.fromEntries(
  args.flatMap((a, i) => (a === '--option' ? [args[i + 1].split('=')] : [])).map(([k, v]) => [k, Number(v)]),
);
const REFERENCE = args.includes('--reference');
const today = new Date().toISOString().slice(0, 10);
const NAME = opt('name', `${today}-${os.platform()}-${os.arch()}`);
const PORT = 4175;
const BASE = `http://localhost:${PORT}`;
const load = (n) => JSON.parse(readFileSync(`data/${n}.json`, 'utf8')).notes;
const DATASETS = Object.fromEntries((opt('datasets', 'sample,test,stress')).split(',').map((n) => [n, load(n)]));

// Timing set: the approved notes repeated up to the maximum note count. Used
// for the max-notes timing budget only, never for quality.
const allNotes = [...load('sample'), ...load('test'), ...load('stress')];
const TIMING_SET = Array.from({ length: BUDGETS.maxNotes }, (_, i) => allNotes[i % allNotes.length].text);

function log(...m) {
  console.log('[bench]', ...m);
}

/** Total RSS (bytes) of a process and all its descendants, from `ps`. */
function treeRss(rootPid) {
  const out = execFileSync('ps', ['-A', '-o', 'pid=,ppid=,rss='], { encoding: 'utf8' });
  const rows = out.trim().split('\n').map((l) => l.trim().split(/\s+/).map(Number));
  const children = new Map();
  for (const [pid, ppid] of rows) children.set(ppid, [...(children.get(ppid) ?? []), pid]);
  const rss = new Map(rows.map(([pid, , r]) => [pid, r * 1024]));
  let total = 0;
  const stack = [rootPid];
  while (stack.length) {
    const p = stack.pop();
    total += rss.get(p) ?? 0;
    stack.push(...(children.get(p) ?? []));
  }
  return total;
}

function sampleMemory(pid) {
  let peak = 0;
  const timer = setInterval(() => {
    try {
      peak = Math.max(peak, treeRss(pid));
    } catch {
      // ps can fail briefly while processes start or exit
    }
  }, 200);
  return () => {
    clearInterval(timer);
    return peak;
  };
}

/** Delays every response by its size at the given bandwidth (simulated throttling). */
async function throttle(context, mbps) {
  const bytesPerMs = (mbps * 1e6) / 8 / 1000;
  await context.route('**/*', async (route) => {
    const response = await route.fetch();
    const body = await response.body();
    await new Promise((r) => setTimeout(r, body.length / bytesPerMs));
    await route.fulfill({ response, body });
  });
}

async function newPage(context) {
  const page = await context.newPage();
  await page.addInitScript(() => {
    window.__longTasks = [];
    try {
      new PerformanceObserver((list) => {
        for (const e of list.getEntries()) window.__longTasks.push(e.duration);
      }).observe({ type: 'longtask', buffered: true });
    } catch {
      // Long Tasks API unavailable in this browser
    }
  });
  await page.goto(BASE);
  await page.waitForSelector('#app[data-ready="true"]');
  return page;
}

async function runOnce(page, texts, seed, pid) {
  await page.evaluate(() => (window.__longTasks = []));
  const stop = sampleMemory(pid);
  const r = await page.evaluate(
    ([t, s, o]) => window.__gtExperiment(t, { seed: s, backend: 'wasm', pipelineOptions: o }),
    [texts, seed, PIPELINE_OPTIONS],
  );
  const peakMemoryBytes = stop();
  const longTasks = await page.evaluate(() => window.__longTasks);
  return { ...r, peakMemoryBytes, longTasks };
}

function summarizeRun(r, notes) {
  const truth = notes.map((n) => n.theme);
  const best = (alg) => {
    const s = r.clusterScores.filter((x) => x.algorithm === alg);
    return s.length ? s.reduce((a, b) => (b.silhouette > a.silhouette ? b : a)) : null;
  };
  const km = best('kmeans');
  const ag = best('agglomerative');
  const sources = r.labelSources;
  return {
    seed: r.seed,
    totalMs: r.ms,
    loadMs: r.loadMs,
    stageMs: r.stageMs,
    downloadedBytes: r.downloadedBytes,
    themes: Math.max(...r.assignments) + 1,
    selected: r.cluster,
    silhouette: { kmeans: km?.silhouette ?? null, agglomerative: ag?.silhouette ?? null },
    bestK: { kmeans: km?.k ?? null, agglomerative: ag?.k ?? null },
    kAgreement: km && ag ? km.k === ag.k : null,
    labels: {
      firstAttempt: sources.filter((s) => s === 'generated').length,
      afterRetry: 0,
      fallback: sources.filter((s) => s === 'fallback').length,
      keyphraseOnly: sources.filter((s) => s === 'keyphrase').length,
    },
    ari: adjustedRandIndex(r.assignments, truth),
    nmi: normalizedMutualInfo(r.assignments, truth),
    peakMemoryBytes: r.peakMemoryBytes,
    longTasksOver200: r.longTasks.filter((d) => d > BUDGETS.longTaskMs).length,
    longestTaskMs: Math.round(Math.max(0, ...r.longTasks)),
    backend: r.backend,
  };
}

function aggregate(runs) {
  const pick = (f) => stats(runs.map(f));
  const stages = Object.keys(runs[0]?.stageMs ?? {});
  return {
    totalMs: pick((r) => r.totalMs),
    loadMs: pick((r) => r.loadMs),
    stageMs: Object.fromEntries(stages.map((s) => [s, pick((r) => r.stageMs[s])])),
    themes: pick((r) => r.themes),
    silhouetteKmeans: pick((r) => r.silhouette.kmeans),
    silhouetteAgglomerative: pick((r) => r.silhouette.agglomerative),
    kAgreementShare: pick((r) => (r.kAgreement === null ? null : r.kAgreement ? 1 : 0)),
    ari: pick((r) => r.ari),
    nmi: pick((r) => r.nmi),
    peakMemoryBytes: pick((r) => r.peakMemoryBytes),
    longTasksOver200: pick((r) => r.longTasksOver200),
    labelFirstAttempt: pick((r) => r.labels.firstAttempt),
    labelAfterRetry: pick((r) => r.labels.afterRetry),
    labelFallback: pick((r) => r.labels.fallback),
  };
}

async function main() {
  if (!args.includes('--no-build')) {
    log('building the test build');
    execFileSync('npm', ['run', 'build:e2e'], { stdio: 'inherit' });
  }
  const server = spawn('npx', ['vite', 'preview', '--outDir', 'dist-e2e', '--port', String(PORT), '--strictPort'], {
    stdio: 'ignore',
  });
  await new Promise((r) => setTimeout(r, 3000));
  const browserServer = await chromium.launchServer({ headless: true });
  const pid = browserServer.process().pid;
  const browser = await chromium.connect(browserServer.wsEndpoint());
  const result = {
    name: NAME,
    date: new Date().toISOString(),
    reference: REFERENCE,
    machine: { platform: os.platform(), arch: os.arch(), cpu: os.cpus()[0]?.model ?? 'unknown', cores: os.cpus().length, memoryBytes: os.totalmem() },
    browser: `chromium ${browser.version()} (headless)`,
    model: { id: EMBEDDING_MODEL.id, revision: EMBEDDING_MODEL.revision, dtype: EMBEDDING_MODEL.dtype },
    pipelineOptions: PIPELINE_OPTIONS,
    constants: {
      REDUCED_DIMENSIONS: C.REDUCED_DIMENSIONS,
      K_MAX: C.K_MAX,
      MIN_NOTES_PER_THEME: C.MIN_NOTES_PER_THEME,
      MIN_CLUSTER_SIZE: C.MIN_CLUSTER_SIZE,
      AGGLOMERATIVE_MAX_N: C.AGGLOMERATIVE_MAX_N,
      KMEANS_RUNS: C.KMEANS_RUNS,
    },
    method: {
      runs: RUNS,
      seeds: Array.from({ length: RUNS }, (_, i) => C.DEFAULT_SEED + i),
      cold: `fresh browser profile, every response delayed by size / ${THROTTLE_MBPS} Mbit/s (simulated throttling), demo sample`,
      warm: 'model files cached; a new page per run (as on a repeat visit), so the model is loaded from cache each time',
      memory: 'peak resident memory of the browser and all its processes, sampled every 200 ms with ps',
      longTasks: 'PerformanceObserver longtask entries on the page during the run',
      backend: 'WebAssembly (headless browsers have no GPU adapter)',
    },
    datasets: {},
  };
  try {
    // Cold run on the demo sample.
    log('cold run (demo sample)');
    const coldContext = await browser.newContext();
    await throttle(coldContext, THROTTLE_MBPS);
    const coldPage = await newPage(coldContext);
    const cold = summarizeRun({ ...(await runOnce(coldPage, DATASETS.sample?.map((n) => n.text) ?? load('sample').map((n) => n.text), C.DEFAULT_SEED, pid)), seed: C.DEFAULT_SEED }, load('sample'));
    await coldContext.close();
    result.cold = cold;

    // Warm runs: one context whose cache is warmed first.
    const context = await browser.newContext();
    const warmup = await newPage(context);
    await runOnce(warmup, load('test').map((n) => n.text), C.DEFAULT_SEED, pid);
    await warmup.close();
    for (const [name, notes] of Object.entries(DATASETS)) {
      const runs = [];
      for (let i = 0; i < RUNS; i += 1) {
        const seed = C.DEFAULT_SEED + i;
        log(`${name}: warm run ${i + 1}/${RUNS} (seed ${seed})`);
        const page = await newPage(context);
        runs.push(summarizeRun({ ...(await runOnce(page, notes.map((n) => n.text), seed, pid)), seed }, notes));
        await page.close();
      }
      result.datasets[name] = { notes: notes.length, trueThemes: new Set(notes.map((n) => n.theme)).size, runs, summary: aggregate(runs) };
    }
    log(`timing set: ${TIMING_SET.length} notes`);
    const page = await newPage(context);
    const big = await runOnce(page, TIMING_SET, C.DEFAULT_SEED, pid);
    result.maxNotes = { notes: TIMING_SET.length, totalMs: big.ms, loadMs: big.loadMs, stageMs: big.stageMs, peakMemoryBytes: big.peakMemoryBytes, longTasksOver200: big.longTasks.filter((d) => d > BUDGETS.longTaskMs).length };
    await context.close();
  } finally {
    await browser.close();
    await browserServer.close();
    server.kill();
  }

  const sample = result.datasets.sample?.summary;
  const verdict = (ok) => (ok ? 'pass' : 'fail');
  result.budgets = [
    { budget: 'Warm run, demo sample (mean)', threshold: `≤ ${BUDGETS.warmMs / 1000} s`, measured: sample ? `${(sample.totalMs.mean / 1000).toFixed(1)} s` : 'n/a', verdict: sample ? verdict(sample.totalMs.mean <= BUDGETS.warmMs) : 'n/a' },
    { budget: `Cold run, demo sample, ${THROTTLE_MBPS} Mbit/s`, threshold: `≤ ${BUDGETS.coldMs / 1000} s`, measured: `${(result.cold.totalMs / 1000).toFixed(1)} s`, verdict: verdict(result.cold.totalMs <= BUDGETS.coldMs) },
    { budget: 'Total model download', threshold: `≤ ${BUDGETS.downloadBytes / 1048576} MB`, measured: `${(result.cold.downloadedBytes / 1048576).toFixed(1)} MB`, verdict: verdict(result.cold.downloadedBytes <= BUDGETS.downloadBytes) },
    { budget: 'Peak memory, demo sample (laptop)', threshold: `≤ ${BUDGETS.peakMemoryBytes / 1024 ** 3} GB`, measured: sample ? `${(sample.peakMemoryBytes.max / 1024 ** 3).toFixed(2)} GB` : 'n/a', verdict: sample ? verdict(sample.peakMemoryBytes.max <= BUDGETS.peakMemoryBytes) : 'n/a' },
    { budget: 'Peak memory (iPhone)', threshold: '≤ 1 GB', measured: 'measured by hand with Safari Web Inspector', verdict: 'not measured' },
    { budget: `Warm run, ${BUDGETS.maxNotes} notes`, threshold: `≤ ${BUDGETS.maxNotesWarmMs / 1000} s`, measured: `${(result.maxNotes.totalMs / 1000).toFixed(1)} s`, verdict: verdict(result.maxNotes.totalMs <= BUDGETS.maxNotesWarmMs) },
    { budget: 'Main-thread tasks over 200 ms (demo sample runs)', threshold: '0', measured: sample ? String(sample.longTasksOver200.max) : 'n/a', verdict: sample ? verdict(sample.longTasksOver200.max === 0) : 'n/a' },
  ];
  if (sample) {
    const sampleRuns = result.datasets.sample.runs.slice(0, 3);
    result.quality = [
      { check: 'Demo sample: 4–8 themes in each of the first 3 runs', measured: sampleRuns.map((r) => r.themes).join(', '), verdict: verdict(sampleRuns.every((r) => r.themes >= 4 && r.themes <= 8)) },
      { check: 'Demo sample: mean ARI of the first 3 runs ≥ 0.6', measured: (stats(sampleRuns.map((r) => r.ari)).mean ?? 0).toFixed(3), verdict: verdict(stats(sampleRuns.map((r) => r.ari)).mean >= 0.6) },
    ];
  }
  mkdirSync('docs/benchmarks', { recursive: true });
  writeFileSync(`docs/benchmarks/${NAME}.json`, `${JSON.stringify(result, null, 2)}\n`);
  writeFileSync(`docs/benchmarks/${NAME}.md`, markdown(result));
  log(`wrote docs/benchmarks/${NAME}.json and .md`);
}

const f1 = (x) => (x === null || x === undefined ? 'n/a' : Number(x).toFixed(1));
const f3 = (x) => (x === null || x === undefined ? 'n/a' : Number(x).toFixed(3));
const range = (s, fmt = f1) => (s.n ? `${fmt(s.mean)} (${fmt(s.min)}–${fmt(s.max)})` : 'n/a');

function markdown(r) {
  const lines = [];
  lines.push(`# Benchmark ${r.name}`, '');
  lines.push(`${r.reference ? 'Measured on the reference setup in docs/adr/001-runtime.md.' : '**Not the reference setup**: indicative only; published figures come from reference runs.'}`, '');
  lines.push('| | |', '|---|---|');
  lines.push(`| Date | ${r.date} |`, `| Machine | ${r.machine.cpu}, ${r.machine.cores} cores, ${(r.machine.memoryBytes / 1024 ** 3).toFixed(0)} GB, ${r.machine.platform}/${r.machine.arch} |`);
  lines.push(`| Browser | ${r.browser} |`, `| Model | ${r.model.id} @ ${r.model.revision.slice(0, 7)} (${r.model.dtype}) |`);
  lines.push(`| Constants | ${Object.entries(r.constants).map(([k, v]) => `${k}=${v}`).join(', ')} |`);
  if (Object.keys(r.pipelineOptions).length) {
    lines.push(`| Options tried | ${Object.entries(r.pipelineOptions).map(([k, v]) => `${k}=${v}`).join(', ')} (instead of the constants) |`);
  }
  lines.push(`| Runs | ${r.method.runs} warm runs per dataset, seeds ${r.method.seeds.join(', ')} |`, '');
  lines.push('## Budgets', '', '| Budget | Threshold | Measured | Verdict |', '|---|---|---|---|');
  for (const b of r.budgets) lines.push(`| ${b.budget} | ${b.threshold} | ${b.measured} | ${b.verdict} |`);
  if (r.quality) {
    lines.push('', '## Clustering quality checks', '', '| Check | Measured | Verdict |', '|---|---|---|');
    for (const q of r.quality) lines.push(`| ${q.check} | ${q.measured} | ${q.verdict} |`);
  }
  lines.push('', '## Per dataset (mean, range over warm runs)', '');
  lines.push('| Metric | ' + Object.keys(r.datasets).join(' | ') + ' |', '|---|' + Object.keys(r.datasets).map(() => '---|').join(''));
  const row = (label, f) => lines.push(`| ${label} | ${Object.values(r.datasets).map((d) => f(d.summary, d)).join(' | ')} |`);
  row('Notes / true themes', (s, d) => `${d.notes} / ${d.trueThemes}`);
  row('Total time (ms)', (s) => range(s.totalMs, (x) => Math.round(x)));
  row('Model load from cache (ms)', (s) => range(s.loadMs, (x) => Math.round(x)));
  for (const stage of Object.keys(Object.values(r.datasets)[0].summary.stageMs)) {
    row(`Stage ${stage} (ms)`, (s) => range(s.stageMs[stage], (x) => Math.round(x)));
  }
  row('Themes', (s) => range(s.themes));
  row('Best silhouette, k-means', (s) => range(s.silhouetteKmeans, f3));
  row('Best silhouette, agglomerative', (s) => range(s.silhouetteAgglomerative, f3));
  row('Same best k for both algorithms (share of runs)', (s) => range(s.kAgreementShare, f3));
  row('ARI vs ground truth', (s) => range(s.ari, f3));
  row('NMI vs ground truth', (s) => range(s.nmi, f3));
  row('Labels: generated first attempt / after retry / fallback', (s) => `${f1(s.labelFirstAttempt.mean)} / ${f1(s.labelAfterRetry.mean)} / ${f1(s.labelFallback.mean)}`);
  row('Peak memory (GB)', (s) => range(s.peakMemoryBytes, (x) => (x / 1024 ** 3).toFixed(2)));
  row('Main-thread tasks over 200 ms', (s) => range(s.longTasksOver200, (x) => String(x)));
  lines.push('', `Cold run (demo sample): ${(r.cold.totalMs / 1000).toFixed(1)} s total, ${(r.cold.loadMs / 1000).toFixed(1)} s to download and load the model, ${(r.cold.downloadedBytes / 1048576).toFixed(1)} MB of model files.`);
  lines.push(`Max-notes run: ${r.maxNotes.notes} notes in ${(r.maxNotes.totalMs / 1000).toFixed(1)} s (cluster stage ${Math.round(r.maxNotes.stageMs.cluster)} ms).`);
  lines.push('', 'Generated labels are not implemented yet: every theme name is keyphrase-based, so label counts are 0.');
  lines.push('', '## Method', '');
  for (const [k, v] of Object.entries(r.method)) if (typeof v === 'string') lines.push(`- ${k}: ${v}`);
  return `${lines.join('\n')}\n`;
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
