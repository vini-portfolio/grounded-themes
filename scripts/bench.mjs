#!/usr/bin/env node
// Headless benchmark: runs the pipeline on every dataset in a real browser and
// writes docs/benchmarks/<name>.json and <name>.md with timings, download size,
// memory, long tasks, clustering quality and budget verdicts.
//
// Usage: npm run bench -- [--runs N] [--cold-runs M] [--name NAME] [--reference]
//                         [--no-build] [--datasets a,b] [--option key=value ...]
//        npm run bench -- --report-from docs/benchmarks/NAME.json
//   --runs N       warm runs per dataset (default 3); run i uses seed 42 + i
//   --cold-runs M  cold runs per dataset, each in a fresh browser profile (default 3)
//   --reference    mark the result as measured on the reference setup (docs/adr/001-runtime.md)
//   --name NAME    output file name (default: today's date, YYYY-MM-DD)
//   --option k=v   pipeline option to try instead of the constants (repeatable)
//   --report-from FILE  only rewrite the .md report next to an existing benchmark .json
import { execFileSync, spawn } from 'node:child_process';
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import net from 'node:net';
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
const COLD_RUNS = Number(opt('cold-runs', 3));
const REFERENCE = args.includes('--reference');
const NAME = opt('name', new Date().toISOString().slice(0, 10));
const PIPELINE_OPTIONS = Object.fromEntries(
  args.flatMap((a, i) => (a === '--option' ? [args[i + 1].split('=')] : [])).map(([k, v]) => [k, Number(v)]),
);
const PORT = 4175;
const BASE = `http://localhost:${PORT}`;
const load = (n) => JSON.parse(readFileSync(`data/${n}.json`, 'utf8')).notes;
const DATASETS = Object.fromEntries(opt('datasets', 'sample,test,stress').split(',').map((n) => [n, load(n)]));

// Timing set: the approved notes (246 unique) repeated up to the maximum note
// count. Used for the max-notes timing budget only, never for quality.
const allNotes = [...load('sample'), ...load('test'), ...load('stress')];
const TIMING_SET = Array.from({ length: BUDGETS.maxNotes }, (_, i) => allNotes[i % allNotes.length].text);

const log = (...m) => console.log('[bench]', ...m);

// ---------------------------------------------------------------- memory
// Linux: proportional set size (shared pages split between processes) from
// /proc/<pid>/smaps_rollup. Elsewhere: resident set size from ps, which counts
// shared pages once per process and so overstates.
const MEMORY_METHOD = existsSync('/proc/self/smaps_rollup') ? 'pss' : 'rss';

function processTree(rootPid) {
  const out = execFileSync('ps', ['-A', '-o', 'pid=,ppid=,rss='], { encoding: 'utf8' });
  const rows = out.trim().split('\n').map((l) => l.trim().split(/\s+/).map(Number));
  const children = new Map();
  for (const [pid, ppid] of rows) children.set(ppid, [...(children.get(ppid) ?? []), pid]);
  const rss = new Map(rows.map(([pid, , r]) => [pid, r * 1024]));
  const pids = [];
  const stack = [rootPid];
  while (stack.length) {
    const p = stack.pop();
    pids.push(p);
    stack.push(...(children.get(p) ?? []));
  }
  return { pids, rss };
}

function treeMemory(rootPid) {
  const { pids, rss } = processTree(rootPid);
  let total = 0;
  for (const pid of pids) {
    if (MEMORY_METHOD === 'pss') {
      try {
        const m = /^Pss:\s+(\d+) kB/m.exec(readFileSync(`/proc/${pid}/smaps_rollup`, 'utf8'));
        total += m ? Number(m[1]) * 1024 : 0;
        continue;
      } catch {
        // process exited or not readable: fall back to RSS for it
      }
    }
    total += rss.get(pid) ?? 0;
  }
  return total;
}

function sampleMemory(pid) {
  let peak = 0;
  const timer = setInterval(() => {
    try {
      peak = Math.max(peak, treeMemory(pid));
    } catch {
      // ps can fail briefly while processes start or exit
    }
  }, 100);
  return () => {
    clearInterval(timer);
    return peak;
  };
}

// ---------------------------------------------------------------- network
/**
 * Approximate throttling: each response is delayed by its size at the given
 * bandwidth after it has been fetched. Parallel downloads overlap, so this
 * is an approximation of a shared 50 Mbit/s link, not true traffic shaping.
 * Playwright routes dedicated-worker requests in Chromium, so model files
 * downloaded by the worker are throttled too.
 */
async function throttle(context, mbps) {
  const bytesPerMs = (mbps * 1e6) / 8 / 1000;
  await context.route('**/*', async (route) => {
    const response = await route.fetch();
    const body = await response.body();
    await new Promise((r) => setTimeout(r, body.length / bytesPerMs));
    await route.fulfill({ response, body });
  });
}

async function waitForPort(port, timeoutMs = 30_000) {
  const end = Date.now() + timeoutMs;
  while (Date.now() < end) {
    const ok = await new Promise((resolve) => {
      const s = net.connect(port, 'localhost', () => {
        s.end();
        resolve(true);
      });
      s.on('error', () => resolve(false));
    });
    if (ok) return;
    await new Promise((r) => setTimeout(r, 200));
  }
  throw new Error(`preview server did not start on port ${port}`);
}

// ---------------------------------------------------------------- runs
async function newPage(context) {
  const page = await context.newPage();
  await page.addInitScript(() => {
    // Main-thread blocking, measured with a 20 ms heartbeat: a gap between
    // ticks much longer than 20 ms means the thread was busy for that long.
    // (The Long Tasks API reports nothing in headless Chromium.)
    window.__longTasks = [];
    window.__longTaskContext = [];
    let last = performance.now();
    setInterval(() => {
      const now = performance.now();
      const gap = now - last - 20;
      if (gap > 50) {
        window.__longTasks.push(gap);
        // Where the page was when the block ended, to locate it (status line, themes shown).
        const app = document.getElementById('app');
        window.__longTaskContext.push({
          ms: Math.round(gap),
          status: document.querySelector('[role=status]')?.textContent?.slice(0, 60) ?? '',
          themes: app?.dataset.themes ?? null,
        });
      }
      last = now;
    }, 20);
  });
  await page.goto(BASE);
  await page.waitForSelector('#app[data-ready="true"]');
  return page;
}

/** Runs the pipeline through the test hook (returns full stage data). */
async function runPipelineOnce(page, texts, seed, pid) {
  await page.evaluate(() => (window.__longTasks = []));
  const stop = sampleMemory(pid);
  const r = await page.evaluate(
    ([t, s, o]) => window.__gtExperiment(t, { seed: s, backend: 'wasm', pipelineOptions: o }),
    [texts, seed, PIPELINE_OPTIONS],
  );
  const peakMemoryBytes = stop();
  const longTasks = await page.evaluate(() => window.__longTasks);
  return { ...r, seed, peakMemoryBytes, longTasks };
}

/** Runs through the real UI: paste, click, wait for themes to render. */
async function runUiOnce(page, texts, pid) {
  await page.evaluate((o) => {
    window.__longTasks = [];
    window.__longTaskContext = [];
    window.__gtPipelineOptions = o;
  }, PIPELINE_OPTIONS);
  const stop = sampleMemory(pid);
  const t0 = Date.now();
  await page.getByLabel('Paste notes').fill(texts.join('\n'));
  // Typing the text into the box is the browser's own work, not the app's:
  // record it separately and measure the app's blocking from the click on.
  const inputBlockMs = await page.evaluate(() => {
    const longest = Math.round(Math.max(0, ...window.__longTasks));
    window.__longTasks = [];
    window.__longTaskContext = [];
    return longest;
  });
  await page.getByRole('button', { name: 'Find themes' }).click();
  await page.waitForSelector('#app[data-themes]', { timeout: 10 * 60_000 });
  // The note list finishes rendering in later tasks; wait for all of it,
  // then one more heartbeat period so a block at the very end is recorded.
  await page.waitForSelector(`#app[data-notes-rendered="${texts.length}"]`, { timeout: 60_000 });
  const totalMs = Date.now() - t0;
  await page.waitForTimeout(150);
  const peakMemoryBytes = stop();
  const longTasks = await page.evaluate(() => window.__longTasks);
  const blocks = await page.evaluate((limit) => window.__longTaskContext.filter((c) => c.ms > limit), BUDGETS.longTaskMs);
  return {
    blocks,
    inputBlockMs,
    totalMs,
    peakMemoryBytes,
    longTasksOver200: longTasks.filter((d) => d > BUDGETS.longTaskMs).length,
    longestTaskMs: Math.round(Math.max(0, ...longTasks)),
  };
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
    merges: r.merges,
    silhouette: { kmeans: km?.silhouette ?? null, agglomerative: ag?.silhouette ?? null },
    bestK: { kmeans: km?.k ?? null, agglomerative: ag?.k ?? null },
    kAgreement: km && ag ? km.k === ag.k : null,
    labels: {
      firstAttempt: sources.filter((s) => s === 'generated').length,
      afterRetry: 0, // TODO(labels): count labels accepted after a retry once generation exists
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
    downloadedBytes: pick((r) => r.downloadedBytes),
    themes: pick((r) => r.themes),
    merges: pick((r) => r.merges),
    silhouetteKmeans: pick((r) => r.silhouette.kmeans),
    silhouetteAgglomerative: pick((r) => r.silhouette.agglomerative),
    bestKKmeans: pick((r) => r.bestK.kmeans),
    bestKAgglomerative: pick((r) => r.bestK.agglomerative),
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

/** Lowest mean ARI over any window of 3 consecutive runs. */
function worstWindow(values, size = 3) {
  let worst = null;
  for (let i = 0; i + size <= values.length; i += 1) {
    const m = values.slice(i, i + size).reduce((s, x) => s + x, 0) / size;
    if (worst === null || m < worst.mean) worst = { mean: m, runs: [i + 1, i + size] };
  }
  return worst;
}

async function main() {
  if (!args.includes('--no-build')) {
    log('building the test build');
    execFileSync('npm', ['run', 'build:e2e'], { stdio: 'inherit' });
  }
  const viteBin = 'node_modules/vite/bin/vite.js';
  const server = spawn(process.execPath, [viteBin, 'preview', '--outDir', 'dist-e2e', '--port', String(PORT), '--strictPort'], {
    stdio: 'ignore',
  });
  let browserServer;
  let browser;
  let commit = 'unknown';
  try {
    commit = execFileSync('git', ['rev-parse', '--short', 'HEAD'], { encoding: 'utf8' }).trim();
  } catch {
    // not a git checkout
  }
  const result = {
    name: NAME,
    date: new Date().toISOString(),
    commit,
    ciRun: process.env.GITHUB_RUN_ID ? `${process.env.GITHUB_REPOSITORY}/actions/runs/${process.env.GITHUB_RUN_ID}` : null,
    reference: REFERENCE,
    machine: {
      platform: os.platform(),
      arch: os.arch(),
      cpu: os.cpus()[0]?.model ?? 'unknown',
      cores: os.cpus().length,
      memoryBytes: os.totalmem(),
    },
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
      coldRuns: COLD_RUNS,
      seeds: Array.from({ length: RUNS }, (_, i) => C.DEFAULT_SEED + i),
      cold: `fresh browser profile per run; each response delayed by its size at ${THROTTLE_MBPS} Mbit/s after fetching (parallel downloads overlap, so this approximates a shared link rather than shaping traffic)`,
      warm: 'model files cached; a new page per run (as on a repeat visit), so the model is loaded from cache each time; pipeline driven through a test hook',
      ui: 'one run per dataset through the real interface (paste, click, wait until the themes and the whole note list are in the page) to include rendering; time counts from the paste, main-thread blocking from the click (filling the text box is the browser\'s own work and is reported separately)',
      memory:
        MEMORY_METHOD === 'pss'
          ? 'peak proportional set size (PSS, shared pages split) of the browser and all its processes, sampled every 100 ms'
          : 'peak resident set size (RSS) of the browser and all its processes, sampled every 100 ms with ps; RSS counts shared pages in every process, so this overstates',
      longTasks: 'main-thread blocking measured by a 20 ms heartbeat on the page: a tick arriving more than 50 ms late is recorded as a block of that length, so blocks under 50 ms are not recorded (the Long Tasks API reports nothing in headless Chromium); validated by a deliberate 300 ms task before the runs',
      backend: 'WebAssembly (headless browsers have no GPU adapter)',
      maxNotes: `${BUDGETS.maxNotes} notes: the ${new Set(allNotes.map((n) => n.text)).size} unique dataset notes repeated; timing only`,
    },
    datasets: {},
  };
  try {
    await waitForPort(PORT);
    browserServer = await chromium.launchServer({ headless: true });
    const pid = browserServer.process().pid;
    browser = await chromium.connect(browserServer.wsEndpoint());
    result.browser = `chromium ${browser.version()} (headless)`;

    // Self-test: the long-task observer must see a deliberate 300 ms task.
    const probeContext = await browser.newContext();
    const probe = await newPage(probeContext);
    await probe.evaluate(() => {
      const end = performance.now() + 300;
      while (performance.now() < end) {
        // busy-wait on purpose
      }
    });
    await probe.waitForTimeout(200);
    const seen = await probe.evaluate(() => window.__longTasks);
    result.longTaskSelfTest = { detected: seen.some((d) => d >= 250 && d <= 400), entries: seen.map(Math.round) };
    await probeContext.close();
    log(`long-task self-test: ${result.longTaskSelfTest.detected ? 'observer works' : 'observer saw nothing'}`);

    for (const [name, notes] of Object.entries(DATASETS)) {
      const texts = notes.map((n) => n.text);
      const cold = [];
      for (let i = 0; i < COLD_RUNS; i += 1) {
        log(`${name}: cold run ${i + 1}/${COLD_RUNS}`);
        const ctx = await browser.newContext();
        await throttle(ctx, THROTTLE_MBPS);
        const page = await newPage(ctx);
        cold.push(summarizeRun(await runPipelineOnce(page, texts, C.DEFAULT_SEED, pid), notes));
        await ctx.close();
      }
      const ctx = await browser.newContext();
      const warmup = await newPage(ctx);
      await runPipelineOnce(warmup, texts.slice(0, 8), C.DEFAULT_SEED, pid);
      await warmup.close();
      const warm = [];
      for (let i = 0; i < RUNS; i += 1) {
        const seed = C.DEFAULT_SEED + i;
        log(`${name}: warm run ${i + 1}/${RUNS} (seed ${seed})`);
        const page = await newPage(ctx);
        warm.push(summarizeRun(await runPipelineOnce(page, texts, seed, pid), notes));
        await page.close();
      }
      log(`${name}: run through the interface`);
      const uiPage = await newPage(ctx);
      const ui = await runUiOnce(uiPage, texts, pid);
      await ctx.close();
      result.datasets[name] = {
        notes: notes.length,
        trueThemes: new Set(notes.map((n) => n.theme)).size,
        cold: { runs: cold, summary: aggregate(cold) },
        runs: warm,
        summary: aggregate(warm),
        worstAriWindow: worstWindow(warm.map((r) => r.ari)),
        ui,
      };
    }

    log(`max notes: ${TIMING_SET.length}`);
    const ctx = await browser.newContext();
    const warmup = await newPage(ctx);
    await runPipelineOnce(warmup, TIMING_SET.slice(0, 8), C.DEFAULT_SEED, pid);
    await warmup.close();
    const page = await newPage(ctx);
    const big = await runPipelineOnce(page, TIMING_SET, C.DEFAULT_SEED, pid);
    const uiPage = await newPage(ctx);
    const bigUi = await runUiOnce(uiPage, TIMING_SET, pid);
    result.maxNotes = {
      notes: TIMING_SET.length,
      totalMs: big.ms,
      loadMs: big.loadMs,
      stageMs: big.stageMs,
      peakMemoryBytes: big.peakMemoryBytes,
      longTasksOver200: big.longTasks.filter((d) => d > BUDGETS.longTaskMs).length,
      ui: bigUi,
    };
    await ctx.close();
  } catch (err) {
    result.error = String(err?.stack ?? err);
    mkdirSync('docs/benchmarks', { recursive: true });
    writeFileSync(`docs/benchmarks/${NAME}.partial.json`, `${JSON.stringify(result, null, 2)}\n`);
    log(`failed; partial results in docs/benchmarks/${NAME}.partial.json`);
    throw err;
  } finally {
    await browser?.close().catch(() => {});
    await browserServer?.close().catch(() => {});
    server.kill();
  }

  addVerdicts(result);
  mkdirSync('docs/benchmarks', { recursive: true });
  writeFileSync(`docs/benchmarks/${NAME}.json`, `${JSON.stringify(result, null, 2)}\n`);
  writeFileSync(`docs/benchmarks/${NAME}.md`, markdown(result));
  log(`wrote docs/benchmarks/${NAME}.json and .md`);
}

function addVerdicts(result) {
  const sample = result.datasets.sample;
  const verdict = (ok) => (ok ? 'pass' : 'fail');
  const sec = (ms) => `${(ms / 1000).toFixed(1)} s`;
  const b = [];
  if (sample) {
    const s = sample.summary;
    b.push({ budget: 'Warm run, demo sample (mean)', threshold: `≤ ${BUDGETS.warmMs / 1000} s`, measured: sec(s.totalMs.mean), verdict: verdict(s.totalMs.mean <= BUDGETS.warmMs) });
    const c = sample.cold.summary;
    b.push({ budget: `Cold run, demo sample, ${THROTTLE_MBPS} Mbit/s (mean)`, threshold: `≤ ${BUDGETS.coldMs / 1000} s`, measured: sec(c.totalMs.mean), verdict: verdict(c.totalMs.mean <= BUDGETS.coldMs) });
    b.push({ budget: 'Total model download', threshold: `≤ ${BUDGETS.downloadBytes / 1048576} MB`, measured: `${(c.downloadedBytes.max / 1048576).toFixed(1)} MB`, verdict: verdict(c.downloadedBytes.max <= BUDGETS.downloadBytes) });
    const peak = Math.max(s.peakMemoryBytes.max, c.peakMemoryBytes.max, sample.ui.peakMemoryBytes);
    b.push({ budget: 'Peak memory, demo sample (laptop)', threshold: `≤ ${BUDGETS.peakMemoryBytes / 1024 ** 3} GB`, measured: `${(peak / 1024 ** 3).toFixed(2)} GB (${MEMORY_METHOD.toUpperCase()})`, verdict: verdict(peak <= BUDGETS.peakMemoryBytes) });
  }
  b.push({ budget: 'Peak memory (iPhone)', threshold: '≤ 1 GB', measured: 'measured by hand with Safari Web Inspector', verdict: 'not measured' });
  b.push({ budget: `Warm run, ${BUDGETS.maxNotes} notes (through the interface)`, threshold: `≤ ${BUDGETS.maxNotesWarmMs / 1000} s`, measured: sec(result.maxNotes.ui.totalMs), verdict: verdict(result.maxNotes.ui.totalMs <= BUDGETS.maxNotesWarmMs) });
  const lt = Math.max(
    ...Object.values(result.datasets).flatMap((d) => [d.summary.longTasksOver200.max, d.ui.longTasksOver200]),
    result.maxNotes.ui.longTasksOver200,
  );
  b.push({
    budget: 'Main-thread tasks over 200 ms (every run, including the interface runs)',
    threshold: '0',
    measured: result.longTaskSelfTest?.detected ? String(lt) : 'observer self-test failed',
    verdict: result.longTaskSelfTest?.detected ? verdict(lt === 0) : 'not measured',
  });
  result.budgets = b;
  if (sample) {
    const runs = sample.runs;
    const meanAri = sample.summary.ari.mean;
    result.quality = [
      { check: 'Demo sample: 4–8 themes in every warm run', measured: runs.map((r) => r.themes).join(', '), verdict: verdict(runs.every((r) => r.themes >= 4 && r.themes <= 8)) },
      { check: `Demo sample: mean ARI over all ${runs.length} warm runs ≥ 0.6`, measured: meanAri.toFixed(3), verdict: verdict(meanAri >= 0.6) },
      { check: 'Demo sample: worst mean ARI over 3 consecutive runs (for information)', measured: sample.worstAriWindow ? sample.worstAriWindow.mean.toFixed(3) : 'n/a', verdict: sample.worstAriWindow ? (sample.worstAriWindow.mean >= 0.6 ? 'pass' : 'below 0.6') : 'n/a' },
    ];
  }
}

function selectedCounts(runs) {
  const counts = new Map();
  for (const r of runs) {
    const key = r.selected ? `${r.selected.algorithm} ${r.selected.k}` : 'none';
    counts.set(key, (counts.get(key) ?? 0) + 1);
  }
  return [...counts].map(([k, n]) => `${k}: ${n}`).join('; ');
}

const f1 = (x) => (x === null || x === undefined ? 'n/a' : Number(x).toFixed(1));
const f3 = (x) => (x === null || x === undefined ? 'n/a' : Number(x).toFixed(3));
const ms = (x) => String(Math.round(x));
const range = (s, fmt = f1) => (s && s.n ? `${fmt(s.mean)} (${fmt(s.min)}–${fmt(s.max)})` : 'n/a');

function markdown(r) {
  const L = [];
  L.push(`# Benchmark ${r.name}`, '');
  L.push(r.reference ? 'Measured on the reference setup in docs/adr/001-runtime.md.' : '**Not the reference setup**: indicative only; published figures come from reference runs.', '');
  L.push('| | |', '|---|---|');
  L.push(`| Date | ${r.date} |`);
  L.push(`| Commit | ${r.commit}${r.ciRun ? ` (CI run ${r.ciRun})` : ''} |`);
  L.push(`| Machine | ${r.machine.cpu}, ${r.machine.cores} cores, ${(r.machine.memoryBytes / 1024 ** 3).toFixed(0)} GB, ${r.machine.platform}/${r.machine.arch} |`);
  L.push(`| Browser | ${r.browser} |`, `| Model | ${r.model.id} @ ${r.model.revision.slice(0, 7)} (${r.model.dtype}) |`);
  L.push(`| Constants | ${Object.entries(r.constants).map(([k, v]) => `${k}=${v}`).join(', ')} |`);
  if (Object.keys(r.pipelineOptions).length) {
    L.push(`| Options tried | ${Object.entries(r.pipelineOptions).map(([k, v]) => `${k}=${v}`).join(', ')} (instead of the constants) |`);
  }
  L.push(`| Runs | ${r.method.coldRuns} cold and ${r.method.runs} warm runs per dataset (warm seeds ${r.method.seeds.join(', ')}), one run through the interface per dataset |`, '');
  L.push('## Budgets', '', '| Budget | Threshold | Measured | Verdict |', '|---|---|---|---|');
  for (const b of r.budgets) L.push(`| ${b.budget} | ${b.threshold} | ${b.measured} | ${b.verdict} |`);
  if (r.quality) {
    L.push('', '## Clustering quality checks', '', '| Check | Measured | Verdict |', '|---|---|---|');
    for (const q of r.quality) L.push(`| ${q.check} | ${q.measured} | ${q.verdict} |`);
  }
  const ds = Object.entries(r.datasets);
  const header = () => {
    L.push(`| Metric | ${ds.map(([n]) => n).join(' | ')} |`, `|---|${ds.map(() => '---|').join('')}`);
  };
  const row = (label, f) => L.push(`| ${label} | ${ds.map(([, d]) => f(d)).join(' | ')} |`);
  L.push('', '## Warm runs per dataset (mean, range)', '');
  header();
  row('Notes / true themes', (d) => `${d.notes} / ${d.trueThemes}`);
  row('Total time (ms)', (d) => range(d.summary.totalMs, ms));
  row('Model load from cache (ms)', (d) => range(d.summary.loadMs, ms));
  for (const stage of Object.keys(ds[0][1].summary.stageMs)) row(`Stage ${stage} (ms)`, (d) => range(d.summary.stageMs[stage], ms));
  row('Themes', (d) => range(d.summary.themes));
  row('Small themes merged', (d) => range(d.summary.merges));
  row('Best silhouette, k-means', (d) => range(d.summary.silhouetteKmeans, f3));
  row('Best silhouette, agglomerative', (d) => range(d.summary.silhouetteAgglomerative, f3));
  row('k with the best silhouette, k-means', (d) => range(d.summary.bestKKmeans));
  row('k with the best silhouette, agglomerative', (d) => range(d.summary.bestKAgglomerative));
  row('Selected configuration (algorithm × k: runs)', (d) => selectedCounts(d.runs));
  row('Same best k for both algorithms (share of runs)', (d) => range(d.summary.kAgreementShare, f3));
  row('ARI vs ground truth', (d) => range(d.summary.ari, f3));
  row('Worst mean ARI over 3 consecutive runs', (d) => (d.worstAriWindow ? f3(d.worstAriWindow.mean) : 'n/a'));
  row('NMI vs ground truth', (d) => range(d.summary.nmi, f3));
  row('Labels: generated first attempt / after retry / fallback', (d) => `${f1(d.summary.labelFirstAttempt.mean)} / ${f1(d.summary.labelAfterRetry.mean)} / ${f1(d.summary.labelFallback.mean)}`);
  row('Peak memory (GB)', (d) => range(d.summary.peakMemoryBytes, (x) => (x / 1024 ** 3).toFixed(2)));
  row('Main-thread tasks over 200 ms', (d) => range(d.summary.longTasksOver200, ms));
  L.push('', '## Cold runs per dataset (mean, range)', '');
  header();
  row('Total time (ms)', (d) => range(d.cold.summary.totalMs, ms));
  row('Download and model load (ms)', (d) => range(d.cold.summary.loadMs, ms));
  for (const stage of Object.keys(ds[0][1].cold.summary.stageMs)) row(`Stage ${stage} (ms)`, (d) => range(d.cold.summary.stageMs[stage], ms));
  row('Model files downloaded (MB)', (d) => range(d.cold.summary.downloadedBytes, (x) => (x / 1048576).toFixed(1)));
  row('Peak memory (GB)', (d) => range(d.cold.summary.peakMemoryBytes, (x) => (x / 1024 ** 3).toFixed(2)));
  L.push('', '## Through the interface (one run per dataset)', '');
  header();
  row('Total time, paste to rendered themes (ms)', (d) => ms(d.ui.totalMs));
  row('Main-thread tasks over 200 ms', (d) => String(d.ui.longTasksOver200));
  row('Longest main-thread block (ms; blocks under 50 ms are not recorded)', (d) => (d.ui.longestTaskMs ? String(d.ui.longestTaskMs) : '< 50'));
  row('Peak memory (GB)', (d) => (d.ui.peakMemoryBytes / 1024 ** 3).toFixed(2));
  const m = r.maxNotes;
  L.push('', `Max notes (${m.notes}): pipeline ${(m.totalMs / 1000).toFixed(1)} s (cluster stage ${ms(m.stageMs.cluster)} ms); through the interface ${(m.ui.totalMs / 1000).toFixed(1)} s, longest main-thread block ${m.ui.longestTaskMs ? `${m.ui.longestTaskMs} ms` : 'under 50 ms'} (measured from the click; the browser's own work filling the text box with ${m.notes} lines took up to ${m.ui.inputBlockMs ?? 'n/a'} ms and is not counted).`);
  for (const b of [...ds.flatMap(([n, d]) => (d.ui.blocks ?? []).map((x) => [n, x])), ...(m.ui.blocks ?? []).map((x) => [`${m.notes} notes`, x])])
    L.push(`- Main-thread block over ${BUDGETS.longTaskMs} ms (${b[0]}, interface run): ${b[1].ms} ms, ending while the status read "${b[1].status}"${b[1].themes ? `, ${b[1].themes} themes shown` : ''}.`);
  L.push('', `Long-task observer self-test: ${r.longTaskSelfTest?.detected ? `a deliberate 300 ms task was detected (${r.longTaskSelfTest.entries.join(', ')} ms)` : 'failed; long-task figures are not reliable'}.`);
  if (Object.keys(r.pipelineOptions).length) L.push('', 'The options tried apply to every run, including the runs through the interface.');
  L.push('', 'Generated labels are not implemented yet: every theme name is keyphrase-based, so label counts are 0.');
  L.push('', '## Method', '');
  for (const [k, v] of Object.entries(r.method)) if (typeof v === 'string') L.push(`- ${k}: ${v}`);
  return `${L.join('\n')}\n`;
}

const reportFrom = opt('report-from', null);
const entry = reportFrom
  ? async () => {
      if (!reportFrom.endsWith('.json')) throw new Error('--report-from needs a benchmark .json file');
      writeFileSync(reportFrom.replace(/\.json$/, '.md'), markdown(JSON.parse(readFileSync(reportFrom, 'utf8'))));
      log(`wrote ${reportFrom.replace(/\.json$/, '.md')}`);
    }
  : main;

entry().catch((err) => {
  console.error(err);
  process.exit(1);
});
