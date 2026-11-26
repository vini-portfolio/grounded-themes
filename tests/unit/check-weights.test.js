import { describe, expect, it } from 'vitest';
import { checkFile, MAX_BYTES } from '../../scripts/lib/weights.mjs';

describe('committed-file guard', () => {
  it('allows ordinary small files', () => {
    expect(checkFile({ path: 'src/main.js', size: 2048, head: 'import' })).toEqual([]);
  });

  it.each(['model.onnx', 'model.onnx_data', 'weights.bin', 'model.safetensors', 'm.pt', 'm.gguf'])(
    'rejects model weight file %s',
    (path) => {
      expect(checkFile({ path, size: 100 })).toHaveLength(1);
    },
  );

  it('rejects files over 10 MB and accepts exactly 10 MB', () => {
    expect(checkFile({ path: 'big.wasm', size: MAX_BYTES + 1 })).toHaveLength(1);
    expect(checkFile({ path: 'ok.wasm', size: MAX_BYTES })).toEqual([]);
  });

  it('rejects Git LFS pointer files', () => {
    const head = 'version https://git-lfs.github.com/spec/v1\noid sha256:abc';
    expect(checkFile({ path: 'runtime.wasm', size: 130, head })).toHaveLength(1);
  });
});
