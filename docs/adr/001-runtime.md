# ADR 001: Runtime, models and budgets

Status: proposed · 2026-11-26 (accepted once the reference setup below is recorded)

## Context

Grounded Themes runs every model in the visitor's browser. Note text must never leave the device, and the page should load code only from its own site. The runtime choices below decide what the browser downloads, from where, and how fast a run can be.

## Decisions

| Item | Decision |
|---|---|
| ML library | `@huggingface/transformers` 4.3.2, exact version in the lockfile |
| ONNX Runtime | `onnxruntime-web` 1.31.0-dev.20260914-8d85527a0 (the library's pinned dependency), resolved to its external-WASM build |
| Runtime files | Served by this site from `/ort/`: `ort-wasm-simd-threaded.asyncify.{mjs,wasm}` (default) and `ort-wasm-simd-threaded.{mjs,wasm}` (Safari below 26 without WebGPU). Copied from `node_modules` at build time, not committed. The library's default points these at a third-party CDN; `src/worker/runtime-config.js` overrides it before any model loads. Re-check this override on every library upgrade. |
| Backend | WebGPU when `navigator.gpu.requestAdapter()` returns an adapter, otherwise WebAssembly. After a GPU device loss, an out-of-memory error or a worker crash, Retry uses WebAssembly (in a fresh worker after a crash or out-of-memory error). Device loss is detected from the error raised by the failing call; the app does not yet listen to `GPUDevice.lost`. |
| Cross-origin isolation | Not enabled (no COOP/COEP headers) in v1: single-threaded WebAssembly, simpler hosting. Revisit if threads are needed to meet the budgets. |
| Worker | All inference runs in a module Web Worker (`src/worker/inference.worker.js`), the only module that imports the ML library. |
| Model host | `https://huggingface.co/` (files may redirect to its CDN hosts under `hf.co` / `huggingface.co`). No fallback host in v1: if the host is blocked, the app names it and offers Retry. |
| Caching | Model files, tokenizer files and runtime binaries are cached with the browser Cache API after the first download. Writes go through a wrapper that records a refused write (storage full); the run still completes, and the app says the model couldn't be kept and offers to stop trying to save it. |
| Model loading | The tokenizer and model are loaded directly rather than through `pipeline()`: in 4.3.2, `pipeline()` and the tokenizer loader look up some files on the `main` branch even when a revision is given. The worker fetches `tokenizer.json` and `tokenizer_config.json` at the pinned commit itself; a browser test fails on any hub request that doesn't name the pinned commit. Download progress is counted in the worker's fetch wrapper. |
| Embedding model | `Xenova/all-MiniLM-L6-v2` at revision `751bff37182d3f1213fa05d7196b954e230abad9`, quantized (`q8`), 384 dimensions, mean pooling, L2-normalized. ONNX conversion of `sentence-transformers/all-MiniLM-L6-v2` (Apache-2.0, upstream revision `1110a243fdf4706b3f48f1d95db1a4f5529b4d41`). |
| Input length | 256 tokens, the upstream model's training limit; longer notes are truncated and counted in the run summary. |
| Label model | Chosen in ADR 002 from a measured comparison. |

## Performance budgets

To be measured by the benchmark script (added in a later change) on the reference setup; every result will record the backend used.

| Budget | Value |
|---|---|
| Warm run, demo sample, labels included | ≤ 20 s |
| Cold run (including downloads) at 50 Mbit/s | ≤ 90 s |
| Total model download | ≤ 300 MB |
| Peak memory | ≤ 2 GB on the reference laptop, ≤ 1 GB on the reference iPhone |
| Main-thread tasks during a run | none over 200 ms |
| Notes per run | 8 to 500 |
| Import file size | ≤ 2 MB |

Reference setup: laptop, iPhone and connection to be recorded here before the first benchmark.

Measurement methods: memory from Chrome DevTools Protocol process metrics (cross-origin isolation is off, so `performance.measureUserAgentSpecificMemory` is unavailable) and Safari Web Inspector on the iPhone; cold runs throttled to 50 Mbit/s through DevTools Protocol network emulation.

## Hosting

The runtime WebAssembly files are 14–27 MB each, under the static host's per-file limits; model weights are never committed or self-hosted.

## Consequences

- The browser fetches code only from this site; the network-log test in `tests/e2e/privacy.spec.js` fails if that changes.
- A blocked model host stops the app with a clear message rather than silently falling back.
