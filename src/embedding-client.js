// Main-thread wrapper around the inference worker.

/**
 * @typedef {{ vectors: Float32Array[], dims: number, truncated: number, backend: string }} EmbedResult
 * @typedef {{ kind: string, hosts: string[], message: string }} EmbedFailure
 */

export class EmbeddingError extends Error {
  /** @param {EmbedFailure} failure */
  constructor(failure) {
    super(failure.message);
    this.name = 'EmbeddingError';
    this.kind = failure.kind;
    this.hosts = failure.hosts ?? [];
  }
}

export function webgpuAvailable() {
  return typeof navigator !== 'undefined' && 'gpu' in navigator;
}

export function createEmbedder({ onProgress = () => {} } = {}) {
  let worker = null;
  let nextId = 1;
  const pending = new Map();

  function start() {
    worker = new Worker(new URL('./worker/inference.worker.js', import.meta.url), { type: 'module' });
    worker.addEventListener('message', (event) => {
      const msg = event.data;
      if (msg.type === 'progress') onProgress(msg);
      const entry = pending.get(msg.id);
      if (!entry) return;
      pending.delete(msg.id);
      if (msg.type === 'result') {
        const vectors = [];
        for (let i = 0; i < msg.count; i += 1) vectors.push(msg.vectors.subarray(i * msg.dims, (i + 1) * msg.dims));
        entry.resolve({ vectors, dims: msg.dims, truncated: msg.truncated, backend: msg.backend });
      } else {
        entry.reject(new EmbeddingError(msg));
      }
    });
    worker.addEventListener('error', (event) => {
      event.preventDefault();
      const failure = { kind: 'crash', hosts: [], message: event.message || 'worker stopped' };
      for (const entry of pending.values()) entry.reject(new EmbeddingError(failure));
      pending.clear();
      worker.terminate();
      worker = null;
    });
  }

  return {
    /**
     * @param {string[]} texts
     * @param {{ backend?: 'webgpu' | 'wasm', cache?: boolean }} [opts]
     * @returns {Promise<EmbedResult>}
     */
    embed(texts, { backend = webgpuAvailable() ? 'webgpu' : 'wasm', cache = true } = {}) {
      if (!worker) start();
      const id = nextId++;
      return new Promise((resolve, reject) => {
        pending.set(id, { resolve, reject });
        worker.postMessage({ type: 'embed', id, texts, backend, cache });
      });
    },
    /** Test builds only: make the worker fail in a given way on the next call. */
    injectFault(kind) {
      if (!worker) start();
      worker.postMessage({ type: 'fault', kind });
    },
    terminate() {
      worker?.terminate();
      worker = null;
    },
  };
}
