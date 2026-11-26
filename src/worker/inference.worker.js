// Inference worker: the only module that imports the ML runtime. Loads the
// embedding model once and embeds batches of note text.
//
// Messages in:  { type: 'embed', id, texts, backend?: 'webgpu' | 'wasm', cache?: boolean }
//               { type: 'fault', kind }   (test builds only)
// Messages out: { type: 'progress', file, loaded, total }
//               { type: 'result', id, vectors: Float32Array, dims, count, truncated, backend }
//               { type: 'error', id, kind, hosts, message }
import { AutoModel, BertTokenizer, env, mean_pooling } from '@huggingface/transformers';
import { classifyError } from './errors.js';
import { EMBEDDING_MODEL, MAX_TOKENS, MODEL_HOST, ortPaths } from './runtime-config.js';

const FAULT_HOOKS = import.meta.env.VITE_FAULT_HOOKS === '1';
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
        self.postMessage({ type: 'progress', file, loaded, total });
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
    if (!res.ok && res.status >= 500) failedHosts.add(url.host);
    const isRange = init?.headers && new Headers(init.headers).has('Range');
    return res.ok && !isRange ? withProgress(res, url.pathname.split('/').pop()) : res;
  } catch (err) {
    failedHosts.add(url.host);
    throw err;
  }
};

let loaded = null; // { tokenizer, model, backend, cache }

const TOKENIZER_CACHE = 'grounded-themes-tokenizer';

// The tokenizer files are fetched here, at the pinned revision, because the
// library's tokenizer loader first checks for tokenizer_config.json on the
// main branch, on every load, ignoring the requested revision.
async function fetchModelJSON(file, cache) {
  const url = `${MODEL_HOST}${EMBEDDING_MODEL.id}/resolve/${EMBEDDING_MODEL.revision}/${file}`;
  const store = cache && 'caches' in self ? await caches.open(TOKENIZER_CACHE) : null;
  let res = store ? await store.match(url) : undefined;
  if (!res) {
    res = await env.fetch(url);
    if (!res.ok) throw new Error(`model file ${file}: HTTP ${res.status}`);
    if (store) await store.put(url, res.clone());
  }
  return res.json();
}

async function loadTokenizer(cache) {
  const [json, config] = await Promise.all([
    fetchModelJSON('tokenizer.json', cache),
    fetchModelJSON('tokenizer_config.json', cache),
  ]);
  return new BertTokenizer(json, config);
}

// The model is loaded directly (not through pipeline()) so its requests,
// including config lookups, use the pinned revision.
async function load(backend, cache) {
  if (loaded && loaded.backend === backend && loaded.cache === cache) return loaded;
  if (loaded) await loaded.model.dispose?.();
  env.useBrowserCache = cache;
  env.useWasmCache = cache;
  const options = { revision: EMBEDDING_MODEL.revision };
  const [tokenizer, model] = await Promise.all([
    loadTokenizer(cache),
    AutoModel.from_pretrained(EMBEDDING_MODEL.id, { ...options, dtype: EMBEDDING_MODEL.dtype, device: backend }),
  ]);
  loaded = { tokenizer, model, backend, cache };
  return loaded;
}

function maybeFault(stage) {
  if (!FAULT_HOOKS || !pendingFault) return;
  const kind = pendingFault;
  if (kind === 'crash' && stage === 'embed') {
    pendingFault = null;
    // An uncaught error outside the message handler terminates processing the
    // way a real crash does: the main thread sees a worker 'error' event.
    setTimeout(() => {
      throw new Error('gt-fault-hook: simulated worker crash');
    });
    throw new Error('gt-fault-hook: crash pending');
  }
  if (kind === 'quota' && stage === 'load') {
    pendingFault = null;
    throw new DOMException('gt-fault-hook: simulated quota', 'QuotaExceededError');
  }
  if (kind === 'oom' && stage === 'embed') {
    pendingFault = null;
    throw new RangeError('gt-fault-hook: out of memory');
  }
  if (kind === 'device-lost' && stage === 'embed') {
    pendingFault = null;
    throw new Error('gt-fault-hook: WebGPU device lost');
  }
}

async function embed({ id, texts, backend = 'wasm', cache = true }) {
  failedHosts.clear();
  try {
    maybeFault('load');
    const { tokenizer, model } = await load(backend, cache);
    maybeFault('embed');
    let truncated = 0;
    for (const text of texts) {
      if (tokenizer.encode(text).length > MAX_TOKENS) truncated += 1;
    }
    const inputs = tokenizer(texts, { padding: true, truncation: true, max_length: MAX_TOKENS });
    const { last_hidden_state: hidden } = await model(inputs);
    const pooled = mean_pooling(hidden, inputs.attention_mask).normalize(2, -1);
    const vectors = new Float32Array(pooled.data);
    const [count, dims] = pooled.dims;
    self.postMessage({ type: 'result', id, vectors, dims, count, truncated, backend }, [vectors.buffer]);
  } catch (err) {
    if (String(err?.message).includes('crash pending')) return;
    // Any failure while a request to the model host failed is a network
    // problem, whatever the library wrapped it in.
    let kind = classifyError(err);
    if (failedHosts.size > 0 && kind === 'unknown') kind = 'network';
    if (kind === 'network' && failedHosts.size === 0) failedHosts.add(new URL(MODEL_HOST).host);
    self.postMessage({ type: 'error', id, kind, hosts: [...failedHosts], message: String(err?.message ?? err) });
  }
}

self.addEventListener('message', (event) => {
  const msg = event.data;
  if (msg?.type === 'embed') embed(msg);
  else if (FAULT_HOOKS && msg?.type === 'fault') pendingFault = msg.kind;
});
