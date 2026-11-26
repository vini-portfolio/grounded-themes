// Deterministic stand-in for the embedding model in unit tests: each word gets
// a fixed pseudo-random unit vector; a text's vector is the normalized sum of
// its words' vectors. Similar texts share words, so they land close together.
import { createRng } from '../../../src/pipeline/rng.js';
import { tokenize, STOPWORDS } from '../../../src/pipeline/keyphrases.js';

const DIMS = 64;
const cache = new Map();

function hash(word) {
  let h = 2166136261;
  for (const ch of word) h = Math.imul(h ^ ch.charCodeAt(0), 16777619);
  return h >>> 0;
}

function wordVector(word) {
  if (!cache.has(word)) {
    const rng = createRng(hash(word));
    cache.set(word, Float64Array.from({ length: DIMS }, () => rng() - 0.5));
  }
  return cache.get(word);
}

export function bowVector(text) {
  const v = new Float64Array(DIMS);
  for (const w of tokenize(text)) {
    if (STOPWORDS.has(w)) continue;
    const wv = wordVector(w);
    for (let i = 0; i < DIMS; i += 1) v[i] += wv[i];
  }
  const n = Math.hypot(...v) || 1;
  return Float32Array.from(v, (x) => x / n);
}

export async function bowEmbed(texts) {
  return { vectors: texts.map(bowVector), dims: DIMS, truncated: 0, backend: 'wasm' };
}

/** Well-separated synthetic clusters: k centers, m points each, small noise. */
export function syntheticClusters({ k = 3, m = 10, dims = 16, noise = 0.05, seed = 1 } = {}) {
  const rng = createRng(seed);
  const centers = Array.from({ length: k }, () => Float64Array.from({ length: dims }, () => rng() - 0.5));
  const rows = [];
  const truth = [];
  for (let c = 0; c < k; c += 1) {
    for (let i = 0; i < m; i += 1) {
      rows.push(Float64Array.from(centers[c], (x) => x + (rng() - 0.5) * noise));
      truth.push(c);
    }
  }
  return { rows, truth };
}

/** True when two labelings group the items identically (up to renaming). */
export function samePartition(a, b) {
  const ab = new Map();
  const ba = new Map();
  for (let i = 0; i < a.length; i += 1) {
    if (ab.has(a[i]) && ab.get(a[i]) !== b[i]) return false;
    if (ba.has(b[i]) && ba.get(b[i]) !== a[i]) return false;
    ab.set(a[i], b[i]);
    ba.set(b[i], a[i]);
  }
  return true;
}
