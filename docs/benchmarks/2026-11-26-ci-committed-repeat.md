# Benchmark 2026-11-26-ci-committed-repeat

**Not the reference setup**: indicative only; published figures come from reference runs.

| | |
|---|---|
| Date | 2026-11-26T21:05:24.819Z |
| Machine | AMD EPYC 9V74 80-Core Processor, 4 cores, 16 GB, linux/x64 |
| Browser | chromium 159.0.8154.6 (headless) |
| Model | Xenova/bge-small-en-v1.5 @ ea104da (q8) |
| Constants | REDUCED_DIMENSIONS=28, K_MAX=12, MIN_NOTES_PER_THEME=6, MIN_CLUSTER_SIZE=3, AGGLOMERATIVE_MAX_N=150, KMEANS_RUNS=30 |
| Runs | 3 cold and 10 warm runs per dataset (warm seeds 42, 43, 44, 45, 46, 47, 48, 49, 50, 51), one run through the interface per dataset |

## Budgets

| Budget | Threshold | Measured | Verdict |
|---|---|---|---|
| Warm run, demo sample (mean) | ≤ 20 s | 3.5 s | pass |
| Cold run, demo sample, 50 Mbit/s (mean) | ≤ 90 s | 22.5 s | pass |
| Total model download | ≤ 300 MB | 58.8 MB | pass |
| Peak memory, demo sample (laptop) | ≤ 2 GB | 0.80 GB (PSS) | pass |
| Peak memory (iPhone) | ≤ 1 GB | measured by hand with Safari Web Inspector | not measured |
| Warm run, 500 notes (through the interface) | ≤ 40 s | 12.4 s | pass |
| Main-thread tasks over 200 ms (every run, including the interface runs) | 0 | 0 | pass |

## Clustering quality checks

| Check | Measured | Verdict |
|---|---|---|
| Demo sample: 4–8 themes in every warm run | 5, 5, 5, 4, 5, 6, 4, 5, 4, 4 | pass |
| Demo sample: mean ARI over all 10 warm runs ≥ 0.6 | 0.632 | pass |
| Demo sample: worst mean ARI over 3 consecutive runs (for information) | 0.561 | below 0.6 |

## Warm runs per dataset (mean, range)

| Metric | sample | test | stress |
|---|---|---|---|
| Notes / true themes | 50 / 5 | 16 / 4 | 180 / 15 |
| Total time (ms) | 3546 (3311–3738) | 2406 (1884–2720) | 5658 (5365–5960) |
| Model load from cache (ms) | 1100 (1063–1141) | 1097 (1046–1133) | 1096 (1049–1127) |
| Stage embed (ms) | 1998 (1768–2218) | 954 (469–1127) | 3349 (2992–3565) |
| Stage reduce (ms) | 23 (16–39) | 10 (3–20) | 89 (78–96) |
| Stage cluster (ms) | 43 (36–59) | 9 (3–27) | 342 (323–379) |
| Stage extract (ms) | 341 (289–416) | 298 (177–471) | 693 (524–762) |
| Stage label (ms) | 0 (0–0) | 0 (0–1) | 0 (0–0) |
| Stage project (ms) | 5 (5–6) | 2 (2–4) | 53 (45–66) |
| Themes | 4.7 (4.0–6.0) | 2.0 (2.0–2.0) | 11.3 (8.0–12.0) |
| Small themes merged | 0.0 (0.0–0.0) | 0.0 (0.0–0.0) | 0.0 (0.0–0.0) |
| Best silhouette, k-means | 0.133 (0.124–0.146) | 0.133 (0.112–0.142) | 0.188 (0.182–0.197) |
| Best silhouette, agglomerative | 0.116 (0.116–0.116) | 0.141 (0.141–0.141) | n/a |
| Same best k for both algorithms (share of runs) | 0.000 (0.000–0.000) | 1.000 (1.000–1.000) | n/a |
| ARI vs ground truth | 0.632 (0.522–0.805) | 0.263 (0.254–0.286) | 0.356 (0.323–0.413) |
| Worst mean ARI over 3 consecutive runs | 0.561 | 0.254 | 0.332 |
| NMI vs ground truth | 0.722 (0.642–0.838) | 0.508 (0.479–0.577) | 0.597 (0.563–0.644) |
| Labels: generated first attempt / after retry / fallback | 0.0 / 0.0 / 0.0 | 0.0 / 0.0 / 0.0 | 0.0 / 0.0 / 0.0 |
| Peak memory (GB) | 0.76 (0.70–0.79) | 0.75 (0.69–0.80) | 0.77 (0.71–0.81) |
| Main-thread tasks over 200 ms | 0 (0–0) | 0 (0–0) | 0 (0–0) |

## Cold runs per dataset (mean, range)

| Metric | sample | test | stress |
|---|---|---|---|
| Total time (ms) | 22483 (22150–22743) | 21847 (21758–21937) | 25008 (24909–25113) |
| Download and model load (ms) | 19765 (19495–19980) | 20090 (20033–20181) | 20192 (19964–20356) |
| Stage embed (ms) | 2107 (2061–2153) | 1071 (1047–1088) | 3397 (3310–3519) |
| Stage reduce (ms) | 25 (20–33) | 16 (9–28) | 86 (84–89) |
| Stage cluster (ms) | 38 (34–46) | 12 (6–22) | 350 (327–363) |
| Stage extract (ms) | 356 (350–367) | 457 (425–507) | 739 (733–745) |
| Stage label (ms) | 0 (0–0) | 0 (0–0) | 0 (0–0) |
| Stage project (ms) | 6 (5–7) | 6 (2–15) | 51 (45–57) |
| Model files downloaded (MB) | 58.8 (58.8–58.8) | 58.8 (58.8–58.8) | 58.8 (58.8–58.8) |
| Peak memory (GB) | 0.76 (0.71–0.78) | 0.78 (0.78–0.78) | 0.78 (0.72–0.81) |

## Through the interface (one run per dataset)

| Metric | sample | test | stress |
|---|---|---|---|
| Total time, paste to rendered themes (ms) | 3901 | 2903 | 5502 |
| Main-thread tasks over 200 ms | 0 | 0 | 0 |
| Longest main-thread task (ms) | 0 | 0 | 0 |
| Peak memory (GB) | 0.80 | 0.80 | 0.73 |

Max notes (500): pipeline 11.6 s (cluster stage 1170 ms); through the interface 12.4 s, longest main-thread task 0 ms.

Generated labels are not implemented yet: every theme name is keyphrase-based, so label counts are 0.

## Method

- cold: fresh browser profile per run; each response delayed by its size at 50 Mbit/s after fetching (parallel downloads overlap, so this approximates a shared link rather than shaping traffic)
- warm: model files cached; a new page per run (as on a repeat visit), so the model is loaded from cache each time; pipeline driven through a test hook
- ui: one run per dataset through the real interface (paste, click, wait until the themes render) to include rendering in timing and long tasks
- memory: peak proportional set size (PSS, shared pages split) of the browser and all its processes, sampled every 100 ms
- longTasks: PerformanceObserver longtask entries on the page (main thread) during the run
- backend: WebAssembly (headless browsers have no GPU adapter)
- maxNotes: 500 notes: the 246 unique dataset notes repeated; timing only
