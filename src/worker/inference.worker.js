// Inference worker: the only module that imports the ML runtime. Loads the
// embedding model once and embeds batches of note text.
//
// Messages in:  { type: 'embed', id, texts, backend?: 'webgpu' | 'wasm', cache?: boolean }
//               { type: 'fault', kind }   (test builds only)
// Messages out: { type: 'progress', file, loaded, total }
//               { type: 'result', id, vectors: Float32Array, dims, count, truncated, backend }
//               { type: 'error', id, kind, hosts, message }
import { env, pipeline } from '@huggingface/transformers';
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
env.fetch = async (input, init) => {
  const url = new URL(typeof input === 'string' ? input : input.url ?? String(input), self.location.href);
  try {
    const res = await baseFetch(input, init);
    if (!res.ok && res.status >= 500) failedHosts.add(url.host);
    return res;
  } catch (err) {
    failedHosts.add(url.host);
    throw err;
  }
};

let extractor = null;
let loadedBackend = null;
let loadedCache = null;

async function load(backend, cache) {
  if (extractor && loadedBackend === backend && loadedCache === cache) return extractor;
  if (extractor) await extractor.dispose?.();
  env.useBrowserCache = cache;
  env.useWasmCache = cache;
  extractor = await pipeline('feature-extraction', EMBEDDING_MODEL.id, {
    revision: EMBEDDING_MODEL.revision,
    dtype: EMBEDDING_MODEL.dtype,
    device: backend,
    progress_callback: (p) => {
      if (p.status === 'progress') {
        self.postMessage({ type: 'progress', file: p.file, loaded: p.loaded ?? 0, total: p.total ?? 0 });
      }
    },
  });
  extractor.tokenizer.model_max_length = MAX_TOKENS;
  loadedBackend = backend;
  loadedCache = cache;
  return extractor;
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
    const model = await load(backend, cache);
    maybeFault('embed');
    let truncated = 0;
    for (const text of texts) {
      if (model.tokenizer.encode(text).length > MAX_TOKENS) truncated += 1;
    }
    const output = await model(texts, { pooling: 'mean', normalize: true });
    const vectors = new Float32Array(output.data);
    const [count, dims] = output.dims;
    self.postMessage({ type: 'result', id, vectors, dims, count, truncated, backend }, [vectors.buffer]);
  } catch (err) {
    if (String(err?.message).includes('crash pending')) return;
    const kind = classifyError(err);
    if (kind === 'network' && failedHosts.size === 0) failedHosts.add(new URL(MODEL_HOST).host);
    self.postMessage({ type: 'error', id, kind, hosts: [...failedHosts], message: String(err?.message ?? err) });
  }
}

self.addEventListener('message', (event) => {
  const msg = event.data;
  if (msg?.type === 'embed') embed(msg);
  else if (FAULT_HOOKS && msg?.type === 'fault') pendingFault = msg.kind;
});
