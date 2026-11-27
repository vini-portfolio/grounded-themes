import { describe, expect, it } from 'vitest';
import { EMBEDDING_MODEL, isSafariBelow26, ortPaths, ORT_FILES } from '../../src/worker/runtime-config.js';
import { classifyError } from '../../src/worker/errors.js';

const SAFARI_18 =
  'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.5 Safari/605.1.15';
const SAFARI_26 =
  'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/26.1 Safari/605.1.15';
const CHROME =
  'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/142.0.0.0 Safari/537.36';

describe('runtime configuration', () => {
  it('pins the embedding model to a full commit hash', () => {
    expect(EMBEDDING_MODEL.revision).toMatch(/^[0-9a-f]{40}$/);
    expect(EMBEDDING_MODEL.license).toBe('MIT');
    expect(EMBEDDING_MODEL.pooling).toBe('cls');
  });

  it('serves ONNX Runtime from this site', () => {
    for (const ua of [CHROME, SAFARI_18, SAFARI_26]) {
      const paths = ortPaths({ userAgent: ua });
      expect(paths.mjs.startsWith('/ort/')).toBe(true);
      expect(paths.wasm.startsWith('/ort/')).toBe(true);
      expect(ORT_FILES).toContain(paths.mjs.slice(5));
      expect(ORT_FILES).toContain(paths.wasm.slice(5));
    }
  });

  it('uses the plain build only on Safari below 26 without WebGPU', () => {
    expect(isSafariBelow26(SAFARI_18)).toBe(true);
    expect(isSafariBelow26(SAFARI_26)).toBe(false);
    expect(isSafariBelow26(CHROME)).toBe(false);
    expect(ortPaths({ userAgent: SAFARI_18 }).wasm).toBe('/ort/ort-wasm-simd-threaded.wasm');
    expect(ortPaths({ userAgent: SAFARI_18, webgpu: true }).wasm).toBe('/ort/ort-wasm-simd-threaded.asyncify.wasm');
    expect(ortPaths({ userAgent: CHROME }).wasm).toBe('/ort/ort-wasm-simd-threaded.asyncify.wasm');
  });
});

describe('failure classification', () => {
  it.each([
    [new TypeError('Failed to fetch'), 'network'],
    [new TypeError('NetworkError when attempting to fetch resource.'), 'network'],
    [Object.assign(new Error('x'), { name: 'QuotaExceededError' }), 'quota'],
    [new RangeError('WebAssembly.Memory(): could not allocate memory'), 'oom'],
    [new Error('RuntimeError: memory access out of bounds'), 'oom'],
    [new Error('WebGPU device lost'), 'device-lost'],
    [new Error('something else'), 'unknown'],
  ])('%s -> %s', (error, kind) => {
    expect(classifyError(error)).toBe(kind);
  });
});
