// Inference worker: the only module that imports the ML runtime. Loads the
// embedding model once and runs the pipeline off the main thread.
//
// Messages in:  { type: 'run', id, texts, seed, backend?: 'webgpu' | 'wasm', cache?: boolean,
//                 modelOverride?, pipelineOptions? }   (the last two honored in test builds only)
//               { type: 'fault', kind }   (test builds only)
// Messages out: { type: 'progress', file, loaded, total }
//               { type: 'stage', id, stage } and { type: 'event', id, event } during a run
//               { type: 'run-result', id, themes, assignments, coordinates, vectors: Float32Array, dims, count,
//                 truncated, backend, cacheFailed, downloadedBytes, modelId }
//               ({ type: 'error', id, kind: 'busy' } if a run is already in progress)
//               { type: 'error', id, kind, hosts, message }
import { AutoModel, BertTokenizer, env, mean_pooling } from '@huggingface/transformers';
import { classifyError } from './errors.js';
import { runPipeline } from '../pipeline/index.js';
import { EMBEDDING_MODEL, MAX_TOKENS, MODEL_HOST, ortPaths } from './runtime-config.js';

const FAULT_HOOKS = import.meta.env.VITE_FAULT_HOOKS === '1';
// The embedding model in use. Test builds may swap it per run to compare models.
let model = EMBEDDING_MODEL;
let downloadedBytes = 0;
let pendingFault = null;

env.allowLocalModels = false;
env.remoteHost = MODEL_HOST;
// Point ONNX Runtime at the copies served by this site instead of the
// library's CDN default.
env.backends.onnx.wasm.wasmPaths = ortPaths({
  userAgent: self.navigator?.userAgent ?? '',
  webgpu: 'gpu' in (self.navigator ?? {}),
});

const failedHosts = new Set();
const baseFetch = env.fetch;

// Download progress is measured here rather than through the library's
// progress callback: that callback triggers extra file-metadata lookups that
// ignore the pinned revision.
function withProgress(res, file) {
  const total = Number(res.headers.get('content-length')) || 0;
  if (!res.body || total === 0) return res;
  let loaded = 0;
  const counted = res.body.pipeThrough(
    new TransformStream({
      transform(chunk, controller) {
        loaded += chunk.byteLength;
        downloadedBytes += chunk.byteLength;
        // content-length is the compressed size for compressed responses, so
        // the total is only a lower bound.
        self.postMessage({ type: 'progress', file, loaded, total: Math.max(total, loaded) });
        controller.enqueue(chunk);
      },
    }),
  );
  return new Response(counted, { status: res.status, statusText: res.statusText, headers: res.headers });
}

env.fetch = async (input, init) => {
  const url = new URL(typeof input === 'string' ? input : input.url ?? String(input), self.location.href);
  try {
    const res = await baseFetch(input, init);
    // 5xx, and the statuses proxies and filters use to block a host.
    if (res.status >= 500 || [401, 403, 407, 451].includes(res.status)) failedHosts.add(url.host);
    const isRange = init?.headers && new Headers(init.headers).has('Range');
    return res.ok && !isRange ? withProgress(res, url.pathname.split('/').pop()) : res;
  } catch (err) {
    failedHosts.add(url.host);
    throw err;
  }
};

let loaded = null; // { tokenizer, model, backend, cache, key }
let running = false;

const modelKey = (m) => `${m.id}@${m.revision}:${m.dtype}`;
let cacheFailed = false; // set when the browser refused to store a file (storage full)

const MODEL_CACHE = 'transformers-cache';
let modelCachePromise = null;
// Wraps the browser cache so a refused write (storage full) is recorded and
// reported instead of being logged and forgotten by the library.
env.useCustomCache = 'caches' in self;
env.customCache = {
  async match(request) {
    modelCachePromise ??= caches.open(MODEL_CACHE);
    return (await modelCachePromise).match(request);
  },
  async put(request, response) {
    modelCachePromise ??= caches.open(MODEL_CACHE);
    try {
      if (FAULT_HOOKS && pendingFault === 'quota') {
        throw new DOMException('gt-fault-hook: simulated quota', 'QuotaExceededError');
      }
      await (await modelCachePromise).put(request, response);
    } catch (err) {
      if (classifyError(err) !== 'quota') throw err;
      cacheFailed = true;
    }
  },
};

const TOKENIZER_CACHE = 'grounded-themes-tokenizer';

// The tokenizer files are fetched here, at the pinned revision, because the
// library's tokenizer loader first checks for tokenizer_config.json on the
// main branch, on every load, ignoring the requested revision.
async function fetchModelJSON(file, cache) {
  const url = `${MODEL_HOST}${model.id}/resolve/${model.revision}/${file}`;
  const store = cache && 'caches' in self ? await caches.open(TOKENIZER_CACHE) : null;
  let res = store ? await store.match(url) : undefined;
  if (!res) {
    res = await env.fetch(url);
    if (!res.ok) throw new Error(`model file ${file}: HTTP ${res.status}`);
    if (store) {
      try {
        if (FAULT_HOOKS && pendingFault === 'quota') {
          throw new DOMException('gt-fault-hook: simulated quota', 'QuotaExceededError');
        }
        await store.put(url, res.clone());
      } catch (err) {
        if (classifyError(err) !== 'quota') throw err;
        cacheFailed = true;
      }
    }
  }
  return res.json();
}

async function loadTokenizer(cache) {
  const [json, config] = await Promise.all([
    fetchModelJSON('tokenizer.json', cache),
    fetchModelJSON('tokenizer_config.json', cache),
  ]);
  // Only BERT-style tokenizers are wired up; fail clearly for anything else.
  if (config.tokenizer_class && config.tokenizer_class !== 'BertTokenizer') {
    throw new Error(`unsupported tokenizer ${config.tokenizer_class} for ${model.id}`);
  }
  return new BertTokenizer(json, config);
}

// The model is loaded directly (not through pipeline()) so its requests,
// including config lookups, use the pinned revision.
async function load(backend, cache) {
  if (loaded && loaded.backend === backend && loaded.cache === cache && loaded.key === modelKey(model)) return loaded;
  if (loaded) {
    try {
      await loaded.model.dispose?.();
    } catch {
      // A lost GPU device can make disposal fail; the new load replaces it anyway.
    }
    loaded = null;
  }
  env.useCustomCache = cache && 'caches' in self;
  env.useBrowserCache = false;
  env.useWasmCache = cache;
  const [tokenizer, net] = await Promise.all([
    loadTokenizer(cache),
    AutoModel.from_pretrained(model.id, { revision: model.revision, dtype: model.dtype, device: backend }),
  ]);
  loaded = { tokenizer, model: net, backend, cache, key: modelKey(model) };
  return loaded;
}

function maybeFault(stage) {
  if (!FAULT_HOOKS || !pendingFault || stage !== 'load') return;
  const kind = pendingFault;
  if (kind === 'quota') return; // consumed by the cache wrapper on its next write
  pendingFault = null;
  if (kind === 'crash') {
    // An uncaught error outside the message handler is what a real crash looks
    // like to the main thread: a worker 'error' event.
    setTimeout(() => {
      throw new Error('gt-fault-hook: simulated worker crash');
    });
    throw new Error('gt-fault-hook: crash pending');
  }
  if (kind === 'oom') throw new RangeError('gt-fault-hook: out of memory');
  if (kind === 'device-lost') throw new Error('gt-fault-hook: WebGPU device lost');
}

const BATCH = 32;

/** Embeds texts in batches; returns unit-length pooled vectors. */
async function embedTexts(rawTexts, backend, cache) {
  const { tokenizer, model: net } = await load(backend, cache);
  const texts = model.prefix ? rawTexts.map((t) => `${model.prefix}${t}`) : rawTexts;
  let truncated = 0;
  const vectors = [];
  let dims = 0;
  for (let start = 0; start < texts.length; start += BATCH) {
    const batch = texts.slice(start, start + BATCH);
    for (const text of batch) if (tokenizer.encode(text).length > MAX_TOKENS) truncated += 1;
    const inputs = tokenizer(batch, { padding: true, truncation: true, max_length: MAX_TOKENS });
    const { last_hidden_state: hidden } = await net(inputs);
    const pooled = (model.pooling === 'cls' ? hidden.slice(null, 0) : mean_pooling(hidden, inputs.attention_mask)).normalize(
      2,
      -1,
    );
    dims = pooled.dims[1];
    const data = pooled.data;
    for (let i = 0; i < batch.length; i += 1) vectors.push(Float32Array.from(data.subarray(i * dims, (i + 1) * dims)));
  }
  return { vectors, dims, truncated, backend };
}

function postFailure(id, err) {
  if (String(err?.message).includes('crash pending')) return;
  // Any failure while a request to the model host failed is a network
  // problem, whatever the library wrapped it in.
  let kind = classifyError(err);
  if (failedHosts.size > 0 && kind === 'unknown') kind = 'network';
  if (kind === 'network' && failedHosts.size === 0) failedHosts.add(new URL(MODEL_HOST).host);
  self.postMessage({ type: 'error', id, kind, hosts: [...failedHosts], message: String(err?.message ?? err) });
}

async function prepare(backend, cache) {
  failedHosts.clear();
  cacheFailed = false;
  maybeFault('load');
  await load(backend, cache);
  if (FAULT_HOOKS && pendingFault === 'quota') {
    // The model is already cached from an earlier run: simulate the refusal
    // on this run's write instead.
    await env.customCache.put(`${MODEL_HOST}__gt_quota_probe`, new Response('x'));
    pendingFault = null;
  }
}

/** Runs the whole pipeline here, off the main thread, reporting each stage. */
const PIPELINE_OPTION_NAMES = ['reducedDimensions', 'minNotesPerTheme', 'kTolerance'];

async function run({ id, texts, backend = 'wasm', cache = true, seed, modelOverride, pipelineOptions }) {
  if (running) {
    self.postMessage({ type: 'error', id, kind: 'busy', hosts: [], message: 'a run is already in progress' });
    return;
  }
  running = true;
  try {
    model = EMBEDDING_MODEL;
    let testOptions = {};
    if (FAULT_HOOKS) {
      // gt-test-override: model and pipeline-option overrides exist only in test builds.
      if (modelOverride) model = modelOverride;
      for (const k of PIPELINE_OPTION_NAMES) if (pipelineOptions?.[k] !== undefined) testOptions[k] = pipelineOptions[k];
    }
    downloadedBytes = 0;
    const loadStart = performance.now();
    await prepare(backend, cache);
    const loadMs = Math.round(performance.now() - loadStart);
    let noteTruncated = 0;
    let first = true;
    const result = await runPipeline({
      texts,
      seed,
      ...testOptions,
      embed: async (batch) => {
        const out = await embedTexts(batch, backend, cache);
        if (first) noteTruncated = out.truncated; // the first call embeds the notes
        first = false;
        return out;
      },
      onStage: (stage) => self.postMessage({ type: 'stage', id, stage }),
      onEvent: (event) => self.postMessage({ type: 'event', id, event }),
    });
    const flat = new Float32Array(result.vectors.length * (result.vectors[0]?.length ?? 0));
    result.vectors.forEach((v, i) => flat.set(v, i * v.length));
    self.postMessage(
      {
        type: 'run-result',
        id,
        themes: result.themes,
        assignments: result.assignments,
        coordinates: result.coordinates,
        vectors: flat,
        dims: result.vectors[0]?.length ?? 0,
        count: result.vectors.length,
        truncated: noteTruncated,
        backend,
        cacheFailed,
        downloadedBytes,
        loadMs,
        modelId: model.id,
      },
      [flat.buffer],
    );
  } catch (err) {
    postFailure(id, err);
  } finally {
    running = false;
  }
}

self.addEventListener('message', (event) => {
  const msg = event.data;
  if (msg?.type === 'run') run(msg);
  else if (FAULT_HOOKS && msg?.type === 'fault') pendingFault = msg.kind;
});
