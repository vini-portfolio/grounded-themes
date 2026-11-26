// Vector helpers for embeddings. Vectors are plain arrays or Float32Arrays.

/** @param {ArrayLike<number>} v */
export function norm(v) {
  let s = 0;
  for (let i = 0; i < v.length; i += 1) s += v[i] * v[i];
  return Math.sqrt(s);
}

/** Cosine similarity of two equal-length vectors. */
export function cosine(a, b) {
  if (a.length !== b.length) throw new RangeError('vectors differ in length');
  let dot = 0;
  for (let i = 0; i < a.length; i += 1) dot += a[i] * b[i];
  const d = norm(a) * norm(b);
  return d === 0 ? 0 : dot / d;
}

/**
 * The k notes most similar to vectors[index], most similar first.
 * Ties keep input order.
 * @param {ArrayLike<number>[]} vectors
 * @param {number} index
 * @param {number} k
 * @returns {{ index: number, similarity: number }[]}
 */
export function nearestNeighbors(vectors, index, k) {
  const target = vectors[index];
  if (!target) throw new RangeError('index out of range');
  return vectors
    .map((v, i) => ({ index: i, similarity: cosine(target, v) }))
    .filter((n) => n.index !== index)
    .sort((x, y) => y.similarity - x.similarity || x.index - y.index)
    .slice(0, k);
}
