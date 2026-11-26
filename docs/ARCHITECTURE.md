# Architecture — Grounded Themes

Design notes, written as the implementation lands. Each section will state the decision, the alternatives considered and how it was measured.

## Constraints

- All inference runs in the browser tab. Note text is never sent to a server.
- Model files are downloaded once from a public model host and cached by the browser.
- Every published figure comes from the benchmark script in this repository.

## Clustering constants

Defined in [`src/pipeline/constants.js`](../src/pipeline/constants.js). Evidence: two benchmark runs on 2026-11-26 in CI (Linux, headless Chromium, WebAssembly backend; not the reference laptop), 10 warm runs per dataset with seeds 42–51, `bge-small-en-v1.5` embeddings.

| Constant | Value | Why |
|---|---|---|
| `K_MAX` | 12 | Upper bound on themes; the stress set (15 ground-truth themes over 180 notes) reaches 8–12. |
| `MIN_NOTES_PER_THEME` | 6 | With 4, the k range on the 50-note demo sample went up to 12 and silhouette picked 10 themes every run (ARI 0.474 against the 5 ground-truth themes; [benchmark](benchmarks/2026-11-26-ci-current.md)). With 6 (k ≤ 8), it picked 4–6 themes, 5 in the first three runs, with mean ARI 0.705 over those three and 0.632 over all ten ([benchmark](benchmarks/2026-11-26-ci-min6.md)). Trade-off: the 16-note test set can now have at most 2 themes (ARI 0.82 → 0.26); it is used for fast tests, not quality. |
| `MIN_CLUSTER_SIZE` | 3 | Themes under 3 notes are merged into the nearest theme; smaller groups read as noise and make keyphrase statistics unreliable. |
| `AGGLOMERATIVE_MAX_N` | 150 | Average-linkage clustering keeps an n × n distance matrix; above 150 notes only spherical k-means runs. The 500-note timing run took 10.5 s in total with the cluster stage at about 1 s. |
| `KMEANS_RUNS` | 30 | k-means initializations per k; the best total similarity is kept. Cluster stage on the demo sample: 40 ms mean. |
| `REDUCED_DIMENSIONS` | 28 | PCA dimensions before clustering. Not re-tuned in this benchmark; revisit with the label model in place. |

Silhouette is low on all datasets (best 0.13–0.19), so the choice of k is sensitive to the k range: these short notes overlap heavily in meaning.

## Stages

1. Embed — _to be written_
2. Reduce — _to be written_
3. Cluster — _to be written_
4. Extract — _to be written_
5. Label — _to be written_
6. Explore — _to be written_
7. Evaluate — _to be written_
