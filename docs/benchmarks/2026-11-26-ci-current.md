# Benchmark 2026-11-26-ci-current

**Not the reference setup**: indicative only; published figures come from reference runs.

| | |
|---|---|
| Date | 2026-11-26T20:08:59.250Z |
| Machine | AMD EPYC 9V74 80-Core Processor, 4 cores, 16 GB, linux/x64 |
| Browser | chromium 159.0.8154.6 (headless) |
| Model | Xenova/bge-small-en-v1.5 @ ea104da (q8) |
| Constants | REDUCED_DIMENSIONS=28, K_MAX=12, MIN_NOTES_PER_THEME=4, MIN_CLUSTER_SIZE=3, AGGLOMERATIVE_MAX_N=150, KMEANS_RUNS=30 |
| Runs | 10 warm runs per dataset, seeds 42, 43, 44, 45, 46, 47, 48, 49, 50, 51 |

## Budgets

| Budget | Threshold | Measured | Verdict |
|---|---|---|---|
| Warm run, demo sample (mean) | ≤ 20 s | 3.4 s | pass |
| Cold run, demo sample, 50 Mbit/s | ≤ 90 s | 20.6 s | pass |
| Total model download | ≤ 300 MB | 58.8 MB | pass |
| Peak memory, demo sample (laptop) | ≤ 2 GB | 1.09 GB | pass |
| Peak memory (iPhone) | ≤ 1 GB | measured by hand with Safari Web Inspector | not measured |
| Warm run, 500 notes | ≤ 40 s | 10.5 s | pass |
| Main-thread tasks over 200 ms (demo sample runs) | 0 | 0 | pass |

## Clustering quality checks

| Check | Measured | Verdict |
|---|---|---|
| Demo sample: 4–8 themes in each of the first 3 runs | 10, 10, 10 | fail |
| Demo sample: mean ARI of the first 3 runs ≥ 0.6 | 0.474 | fail |

## Per dataset (mean, range over warm runs)

| Metric | sample | test | stress |
|---|---|---|---|
| Notes / true themes | 50 / 5 | 16 / 4 | 180 / 15 |
| Total time (ms) | 3401 (3153–3590) | 2273 (1855–2548) | 4994 (4673–5343) |
| Model load from cache (ms) | 983 (958–1051) | 971 (940–1003) | 963 (934–985) |
| Stage embed (ms) | 1644 (1388–1856) | 879 (472–1026) | 2911 (2563–3213) |
| Stage reduce (ms) | 18 (15–26) | 5 (3–14) | 79 (75–86) |
| Stage cluster (ms) | 69 (58–76) | 6 (5–11) | 296 (288–309) |
| Stage extract (ms) | 646 (637–655) | 378 (287–537) | 665 (510–721) |
| Stage label (ms) | 0 (0–0) | 0 (0–0) | 0 (0–0) |
| Stage project (ms) | 6 (5–7) | 2 (2–2) | 46 (44–52) |
| Themes | 10.0 (10.0–10.0) | 4.0 (4.0–4.0) | 11.3 (8.0–12.0) |
| Best silhouette, k-means | 0.133 (0.124–0.146) | 0.150 (0.142–0.155) | 0.188 (0.182–0.197) |
| Best silhouette, agglomerative | 0.154 (0.154–0.154) | 0.155 (0.155–0.155) | n/a |
| Same best k for both algorithms (share of runs) | 0.000 (0.000–0.000) | 0.900 (0.000–1.000) | n/a |
| ARI vs ground truth | 0.474 (0.474–0.474) | 0.821 (0.821–0.821) | 0.356 (0.323–0.413) |
| NMI vs ground truth | 0.609 (0.609–0.609) | 0.892 (0.892–0.892) | 0.597 (0.563–0.644) |
| Labels: generated first attempt / after retry / fallback | 0.0 / 0.0 / 0.0 | 0.0 / 0.0 / 0.0 | 0.0 / 0.0 / 0.0 |
| Peak memory (GB) | 1.05 (1.00–1.09) | 1.04 (0.99–1.09) | 1.05 (0.99–1.09) |
| Main-thread tasks over 200 ms | 0 (0–0) | 0 (0–0) | 0 (0–0) |

Cold run (demo sample): 20.6 s total, 18.1 s to download and load the model, 58.8 MB of model files.
Max-notes run: 500 notes in 10.5 s (cluster stage 1014 ms).

Generated labels are not implemented yet: every theme name is keyphrase-based, so label counts are 0.

## Method

- cold: fresh browser profile, every response delayed by size / 50 Mbit/s (simulated throttling), demo sample
- warm: model files cached; a new page per run (as on a repeat visit), so the model is loaded from cache each time
- memory: peak resident memory of the browser and all its processes, sampled every 200 ms with ps
- longTasks: PerformanceObserver longtask entries on the page during the run
- backend: WebAssembly (headless browsers have no GPU adapter)
