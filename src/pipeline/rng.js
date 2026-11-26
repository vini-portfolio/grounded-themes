// Seeded pseudo-random number generator (mulberry32).
// Every stochastic step in the pipeline takes one of these, so a run with the
// same input and seed is reproducible.

/**
 * @param {number} seed 32-bit integer seed
 * @returns {() => number} function returning floats in [0, 1)
 */
export function createRng(seed) {
  if (!Number.isInteger(seed)) throw new TypeError('seed must be an integer');
  let state = seed >>> 0;
  return function next() {
    state = (state + 0x6d2b79f5) >>> 0;
    let t = state;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/**
 * Integer in [0, n) drawn from rng.
 * @param {() => number} rng
 * @param {number} n
 */
export function randomInt(rng, n) {
  if (!Number.isInteger(n) || n <= 0) throw new RangeError('n must be a positive integer');
  return Math.floor(rng() * n);
}
