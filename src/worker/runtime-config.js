// Runtime configuration for the inference worker. Single source for the model
// identity, the ONNX Runtime file locations and the input-length limit.
// See docs/adr/001-runtime.md for the reasoning.

export const EMBEDDING_MODEL = Object.freeze({
  id: 'Xenova/all-MiniLM-L6-v2',
  // Pinned commit on the model host; bump only together with the ADR.
  revision: '751bff37182d3f1213fa05d7196b954e230abad9',
  dtype: 'q8',
  dimensions: 384,
  license: 'Apache-2.0',
  upstream: 'sentence-transformers/all-MiniLM-L6-v2',
  pooling: 'mean',
  prefix: '',
});

// all-MiniLM-L6-v2 was trained with a 256-token limit (sentence-transformers
// max_seq_length). Longer notes are truncated to this many tokens.
export const MAX_TOKENS = 256;

export const MODEL_HOST = 'https://huggingface.co/';

/**
 * True for Safari releases before 26, where the asyncify build of ONNX Runtime
 * misbehaves without WebGPU (mirrors the library's own rule).
 * @param {string} userAgent
 */
export function isSafariBelow26(userAgent) {
  if (!/Safari\//.test(userAgent) || /(Chrome|Chromium|CriOS|FxiOS|Edg|OPR)\//.test(userAgent)) return false;
  const match = /Version\/(\d+)/.exec(userAgent);
  return match ? Number(match[1]) < 26 : false;
}

/**
 * Same-origin URLs of the ONNX Runtime factory and binary.
 * @param {{ base?: string, userAgent?: string, webgpu?: boolean }} opts
 */
export function ortPaths({ base = '/ort/', userAgent = '', webgpu = false } = {}) {
  const suffix = isSafariBelow26(userAgent) && !webgpu ? '' : '.asyncify';
  return {
    mjs: `${base}ort-wasm-simd-threaded${suffix}.mjs`,
    wasm: `${base}ort-wasm-simd-threaded${suffix}.wasm`,
  };
}

/** The ONNX Runtime files copied into public/ort at build time. */
export const ORT_FILES = [
  'ort-wasm-simd-threaded.asyncify.mjs',
  'ort-wasm-simd-threaded.asyncify.wasm',
  'ort-wasm-simd-threaded.mjs',
  'ort-wasm-simd-threaded.wasm',
];
