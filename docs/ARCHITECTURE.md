# Architecture — Grounded Themes

Design notes, written as the implementation lands. Each section will state the decision, the alternatives considered and how it was measured.

## Constraints

- All inference runs in the browser tab. Note text is never sent to a server.
- Model files are downloaded once from a public model host and cached by the browser.
- Every published figure comes from the benchmark script in this repository.

## Clustering constants

Defined in [`src/pipeline/constants.js`](../src/pipeline/constants.js). Evidence: CI benchmarks on 2026-11-26 (Linux, headless Chromium, WebAssembly backend; **not** the reference laptop), `bge-small-en-v1.5` embeddings, 10 warm runs per dataset with seeds 42–51. Main result: [2026-11-26-ci-committed](benchmarks/2026-11-26-ci-committed.md), repeated in [2026-11-26-ci-committed-repeat](benchmarks/2026-11-26-ci-committed-repeat.md) within tolerance.

| Constant | Value | Evidence |
|---|---|---|
| `MIN_NOTES_PER_THEME` | 6 | Tuned; see below. |
| `K_MAX` | 12 | Not tuned. On the stress set (180 notes, 15 ground-truth themes) the cap binds: 8–12 themes, ARI 0.356 ([benchmark](benchmarks/2026-11-26-ci-committed.md)). Raising it is untested. |
| `MIN_CLUSTER_SIZE` | 3 | Not tuned. No theme was merged in any run on any dataset, so it had no effect here ([benchmark](benchmarks/2026-11-26-ci-committed.md), "Small themes merged"). Kept at 3 so keyphrase statistics have at least three notes. |
| `AGGLOMERATIVE_MAX_N` | 150 | Not tuned. The 500-note timing run took 11.5 s through the pipeline (cluster stage 1.2 s) and 12.0 s through the interface, within the 40 s budget ([benchmark](benchmarks/2026-11-26-ci-committed.md)). |
| `KMEANS_RUNS` | 30 | Not tuned. Cluster stage: 51 ms mean on the demo sample, 341 ms on the stress set ([benchmark](benchmarks/2026-11-26-ci-committed.md)). |
| `REDUCED_DIMENSIONS` | 28 | Not tuned in a benchmark; revisit with the label model in place. |

### Why one theme per 6 notes

With one theme allowed per 4 notes, the k range on the 50-note demo sample runs to 12. Spherical k-means scored best at k = 5 in every run, but agglomerative clustering's silhouette rose with k and peaked at the top of the range (k = 12, 0.154), so it won and gave 10 themes after merging: ARI 0.474 in all ten runs ([min4](benchmarks/2026-11-26-ci-min4.md)). Capping the range at floor(50 / 6) = 8 removes that choice, and k-means wins. So the fix works by keeping agglomerative clustering out of k values it over-splits, not because 6 notes per theme is itself the right size.

| Setting (demo sample, 10 runs) | Themes | Mean ARI | Worst 3-run window |
|---|---|---|---|
| One per 4 notes ([report](benchmarks/2026-11-26-ci-min4.md)) | 10 every run | 0.474 | 0.474 |
| One per 5 notes ([report](benchmarks/2026-11-26-ci-min5.md)) | 4–9 | 0.580 | 0.467 |
| One per 4 notes, tolerance 0.01 ([report](benchmarks/2026-11-26-ci-min4-tol01.md)) | 5–10 | 0.507 | 0.474 |
| One per 4 notes, tolerance 0.02 ([report](benchmarks/2026-11-26-ci-min4-tol02.md)) | 4–9 | 0.563 | 0.467 |
| **One per 6 notes** ([report](benchmarks/2026-11-26-ci-committed.md)) | **4–6** | **0.632** | 0.561 |

The demo-sample checks pass: every run has 4–8 themes, and the mean ARI over all ten runs is 0.632. The pass is marginal: three of the eight windows of three consecutive runs average below 0.6 (worst 0.561). Trade-off: the 16-note test set can now get at most 2 themes (ARI 0.821 → 0.263); it is used for fast tests, not quality. Silhouette is low throughout (best per run 0.11–0.20), so the choice of k stays sensitive to the range.

## Stages

1. Embed — _to be written_
2. Reduce — _to be written_
3. Cluster — _to be written_
4. Extract — _to be written_
5. Label — _to be written_
6. Explore — _to be written_
7. Evaluate — _to be written_
