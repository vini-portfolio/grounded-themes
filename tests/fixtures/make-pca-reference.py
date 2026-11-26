"""Regenerates pca-reference.json (run from the repo root: python3 tests/fixtures/make-pca-reference.py).
Reference PCA scores from numpy's SVD of centred data, for the unit tests."""
import json
import numpy as np

rng = np.random.default_rng(20261126)
out = {}
for name, (n, d, k) in {"wide": (40, 60, 5), "tall": (90, 30, 4)}.items():
    X = rng.normal(size=(n, d)).round(6)
    Xc = X - X.mean(axis=0)
    U, S, Vt = np.linalg.svd(Xc, full_matrices=False)
    scores = U[:, :k] * S[:k]
    ev = float((S[:k] ** 2).sum() / (S ** 2).sum())
    out[name] = {"rows": X.tolist(), "k": k, "scores": scores.round(12).tolist(), "explainedVarianceRatio": ev}
out["generated_by"] = "numpy.linalg.svd on centred data; scores = U[:, :k] * S[:k]; signs are arbitrary per component"
with open("tests/fixtures/pca-reference.json", "w") as f:
    json.dump(out, f)
