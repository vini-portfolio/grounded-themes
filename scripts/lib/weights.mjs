// Pure rules for the committed-file guard (used by check-weights.mjs and its tests).

export const MAX_BYTES = 10 * 1024 * 1024;
export const WEIGHT_EXT = /\.(onnx|onnx_data|bin|safetensors|pt|pth|ckpt|gguf|tflite|h5|npz|pb)$/i;
const LFS_POINTER = 'version https://git-lfs.github.com/spec/';

/**
 * @param {{ path: string, size: number, head?: string }} file
 *   head: the first bytes of the file as text (used to detect Git LFS pointers)
 * @returns {string[]} problems (empty when the file is allowed)
 */
export function checkFile({ path, size, head = '' }) {
  const problems = [];
  if (WEIGHT_EXT.test(path)) problems.push(`${path}: model weight file`);
  if (size > MAX_BYTES) problems.push(`${path}: ${(size / 1048576).toFixed(1)} MB exceeds 10 MB`);
  if (head.startsWith(LFS_POINTER)) problems.push(`${path}: Git LFS pointer (large files are not allowed)`);
  return problems;
}
