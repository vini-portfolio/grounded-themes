// Small dense linear-algebra helpers. Matrices are arrays of Float64Array rows.

/** @param {ArrayLike<number>} a @param {ArrayLike<number>} b */
export function dot(a, b) {
  let s = 0;
  for (let i = 0; i < a.length; i += 1) s += a[i] * b[i];
  return s;
}

/** Returns a unit-length copy of v (zero vectors stay zero). */
export function unit(v) {
  const n = Math.sqrt(dot(v, v));
  const out = new Float64Array(v.length);
  if (n === 0) return out;
  for (let i = 0; i < v.length; i += 1) out[i] = v[i] / n;
  return out;
}

/** Mean of the given rows (all rows when indexes is omitted). */
export function mean(rows, indexes = null) {
  const idx = indexes ?? rows.map((_, i) => i);
  const out = new Float64Array(rows[0].length);
  for (const i of idx) for (let j = 0; j < out.length; j += 1) out[j] += rows[i][j];
  for (let j = 0; j < out.length; j += 1) out[j] /= idx.length || 1;
  return out;
}

/**
 * Eigen-decomposition of a real symmetric matrix (Householder reduction to
 * tridiagonal form, then the implicit QL algorithm).
 * @param {number[][] | Float64Array[]} matrix n x n, symmetric
 * @returns {{ values: Float64Array, vectors: Float64Array[] }}
 *   values sorted descending; vectors[k] is the unit eigenvector for values[k],
 *   with its largest-magnitude component made positive for determinism.
 */
export function symmetricEigen(matrix) {
  const n = matrix.length;
  const a = Array.from({ length: n }, (_, i) => Float64Array.from(matrix[i]));
  const d = new Float64Array(n);
  const e = new Float64Array(n);

  // Householder tridiagonalization (a is overwritten with the transformation).
  for (let i = n - 1; i > 0; i -= 1) {
    const l = i - 1;
    let h = 0;
    if (l > 0) {
      let scale = 0;
      for (let k = 0; k <= l; k += 1) scale += Math.abs(a[i][k]);
      if (scale === 0) {
        e[i] = a[i][l];
      } else {
        for (let k = 0; k <= l; k += 1) {
          a[i][k] /= scale;
          h += a[i][k] * a[i][k];
        }
        let f = a[i][l];
        const g = f >= 0 ? -Math.sqrt(h) : Math.sqrt(h);
        e[i] = scale * g;
        h -= f * g;
        a[i][l] = f - g;
        f = 0;
        for (let j = 0; j <= l; j += 1) {
          a[j][i] = a[i][j] / h;
          let gg = 0;
          for (let k = 0; k <= j; k += 1) gg += a[j][k] * a[i][k];
          for (let k = j + 1; k <= l; k += 1) gg += a[k][j] * a[i][k];
          e[j] = gg / h;
          f += e[j] * a[i][j];
        }
        const hh = f / (h + h);
        for (let j = 0; j <= l; j += 1) {
          const ff = a[i][j];
          const gg = e[j] - hh * ff;
          e[j] = gg;
          for (let k = 0; k <= j; k += 1) a[j][k] -= ff * e[k] + gg * a[i][k];
        }
      }
    } else {
      e[i] = a[i][l];
    }
    d[i] = h;
  }
  d[0] = 0;
  e[0] = 0;
  for (let i = 0; i < n; i += 1) {
    const l = i - 1;
    if (d[i] !== 0) {
      for (let j = 0; j <= l; j += 1) {
        let g = 0;
        for (let k = 0; k <= l; k += 1) g += a[i][k] * a[k][j];
        for (let k = 0; k <= l; k += 1) a[k][j] -= g * a[k][i];
      }
    }
    d[i] = a[i][i];
    a[i][i] = 1;
    for (let j = 0; j <= l; j += 1) {
      a[j][i] = 0;
      a[i][j] = 0;
    }
  }

  // Implicit QL on the tridiagonal matrix (d diagonal, e sub-diagonal).
  for (let i = 1; i < n; i += 1) e[i - 1] = e[i];
  e[n - 1] = 0;
  for (let l = 0; l < n; l += 1) {
    let iter = 0;
    let m;
    do {
      for (m = l; m < n - 1; m += 1) {
        const dd = Math.abs(d[m]) + Math.abs(d[m + 1]);
        if (Math.abs(e[m]) <= Number.EPSILON * dd) break;
      }
      if (m !== l) {
        if (iter++ === 60) throw new Error('symmetricEigen: no convergence');
        let g = (d[l + 1] - d[l]) / (2 * e[l]);
        let r = Math.hypot(g, 1);
        g = d[m] - d[l] + e[l] / (g + (g >= 0 ? Math.abs(r) : -Math.abs(r)));
        let s = 1;
        let c = 1;
        let p = 0;
        let i;
        for (i = m - 1; i >= l; i -= 1) {
          let f = s * e[i];
          const b = c * e[i];
          r = Math.hypot(f, g);
          e[i + 1] = r;
          if (r === 0) {
            d[i + 1] -= p;
            e[m] = 0;
            break;
          }
          s = f / r;
          c = g / r;
          g = d[i + 1] - p;
          r = (d[i] - g) * s + 2 * c * b;
          p = s * r;
          d[i + 1] = g + p;
          g = c * r - b;
          for (let k = 0; k < n; k += 1) {
            f = a[k][i + 1];
            a[k][i + 1] = s * a[k][i] + c * f;
            a[k][i] = c * a[k][i] - s * f;
          }
        }
        if (r === 0 && i >= l) continue;
        d[l] -= p;
        e[l] = g;
        e[m] = 0;
      }
    } while (m !== l);
  }

  const order = Array.from({ length: n }, (_, i) => i).sort((x, y) => d[y] - d[x]);
  const values = Float64Array.from(order.map((i) => d[i]));
  const vectors = order.map((col) => {
    const v = Float64Array.from({ length: n }, (_, k) => a[k][col]);
    let big = 0;
    for (let k = 1; k < n; k += 1) if (Math.abs(v[k]) > Math.abs(v[big])) big = k;
    if (v[big] < 0) for (let k = 0; k < n; k += 1) v[k] = -v[k];
    return v;
  });
  return { values, vectors };
}
