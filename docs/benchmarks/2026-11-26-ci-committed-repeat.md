# Benchmark 2026-11-26-ci-committed-repeat

**Not the reference setup**: indicative only; published figures come from reference runs.

| | |
|---|---|
| Date | 2026-11-26T23:19:25.994Z |
| Commit | 0348d85 (CI run vini-portfolio/grounded-themes/actions/runs/45907930009) |
| Machine | AMD EPYC 9V74 80-Core Processor, 4 cores, 16 GB, linux/x64 |
| Browser | chromium 159.0.8154.6 (headless) |
| Model | Xenova/bge-small-en-v1.5 @ ea104da (q8) |
| Constants | REDUCED_DIMENSIONS=28, K_MAX=12, MIN_NOTES_PER_THEME=6, MIN_CLUSTER_SIZE=3, AGGLOMERATIVE_MAX_N=150, KMEANS_RUNS=30 |
| Runs | 3 cold and 10 warm runs per dataset (warm seeds 42, 43, 44, 45, 46, 47, 48, 49, 50, 51), one run through the interface per dataset |

## Budgets

| Budget | Threshold | Measured | Verdict |
|---|---|---|---|
| Warm run, demo sample (mean) | ≤ 20 s | 3.4 s | pass |
| Cold run, demo sample, 50 Mbit/s (mean) | ≤ 90 s | 22.4 s | pass |
| Total model download | ≤ 300 MB | 58.8 MB | pass |
| Peak memory, demo sample (laptop) | ≤ 2 GB | 0.80 GB (PSS) | pass |
| Peak memory (iPhone) | ≤ 1 GB | measured by hand with Safari Web Inspector | not measured |
| Warm run, 500 notes (through the interface) | ≤ 40 s | 11.6 s | pass |
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
| Total time (ms) | 3394 (3153–3621) | 2497 (2181–2701) | 5393 (5067–5865) |
| Model load from cache (ms) | 1063 (1031–1097) | 1059 (1026–1096) | 1071 (1007–1131) |
| Stage embed (ms) | 1894 (1633–2132) | 1072 (859–1158) | 3120 (2780–3573) |
| Stage reduce (ms) | 19 (16–28) | 18 (5–45) | 88 (77–99) |
| Stage cluster (ms) | 43 (33–64) | 11 (3–24) | 332 (317–345) |
| Stage extract (ms) | 333 (281–387) | 296 (181–439) | 687 (511–735) |
| Stage label (ms) | 0 (0–0) | 0 (0–0) | 0 (0–0) |
| Stage project (ms) | 5 (5–6) | 3 (2–16) | 59 (45–73) |
| Themes | 4.7 (4.0–6.0) | 2.0 (2.0–2.0) | 11.3 (8.0–12.0) |
| Small themes merged | 0.0 (0.0–0.0) | 0.0 (0.0–0.0) | 0.0 (0.0–0.0) |
| Best silhouette, k-means | 0.133 (0.124–0.146) | 0.133 (0.112–0.142) | 0.188 (0.182–0.197) |
| Best silhouette, agglomerative | 0.116 (0.116–0.116) | 0.141 (0.141–0.141) | n/a |
| k with the best silhouette, k-means | 4.7 (4.0–6.0) | 2.0 (2.0–2.0) | 11.3 (8.0–12.0) |
| k with the best silhouette, agglomerative | 8.0 (8.0–8.0) | 2.0 (2.0–2.0) | n/a |
| Selected configuration (algorithm × k: runs) | kmeans 5: 5; kmeans 4: 4; kmeans 6: 1 | agglomerative 2: 3; kmeans 2: 7 | kmeans 12: 6; kmeans 11: 3; kmeans 8: 1 |
| Same best k for both algorithms (share of runs) | 0.000 (0.000–0.000) | 1.000 (1.000–1.000) | n/a |
| ARI vs ground truth | 0.632 (0.522–0.805) | 0.263 (0.254–0.286) | 0.356 (0.323–0.413) |
| Worst mean ARI over 3 consecutive runs | 0.561 | 0.254 | 0.332 |
| NMI vs ground truth | 0.722 (0.642–0.838) | 0.508 (0.479–0.577) | 0.597 (0.563–0.644) |
| Labels: generated first attempt / after retry / fallback | 0.0 / 0.0 / 0.0 | 0.0 / 0.0 / 0.0 | 0.0 / 0.0 / 0.0 |
| Peak memory (GB) | 0.78 (0.70–0.80) | 0.77 (0.71–0.80) | 0.74 (0.70–0.79) |
| Main-thread tasks over 200 ms | 0 (0–0) | 0 (0–0) | 0 (0–0) |

## Cold runs per dataset (mean, range)

| Metric | sample | test | stress |
|---|---|---|---|
| Total time (ms) | 22399 (22135–22903) | 21320 (21080–21515) | 24533 (24059–25160) |
| Download and model load (ms) | 19928 (19651–20229) | 19784 (19719–19881) | 20063 (19864–20358) |
| Stage embed (ms) | 1862 (1621–2085) | 1030 (913–1112) | 3070 (2803–3391) |
| Stage reduce (ms) | 18 (15–19) | 20 (12–29) | 86 (82–88) |
| Stage cluster (ms) | 37 (35–40) | 14 (5–25) | 329 (315–342) |
| Stage extract (ms) | 362 (342–378) | 280 (190–446) | 740 (733–746) |
| Stage label (ms) | 0 (0–0) | 0 (0–0) | 0 (0–0) |
| Stage project (ms) | 6 (5–7) | 2 (2–3) | 52 (51–53) |
| Model files downloaded (MB) | 58.8 (58.8–58.8) | 58.8 (58.8–58.8) | 58.8 (58.8–58.8) |
| Peak memory (GB) | 0.75 (0.70–0.80) | 0.78 (0.76–0.80) | 0.77 (0.72–0.79) |

## Through the interface (one run per dataset)

| Metric | sample | test | stress |
|---|---|---|---|
| Total time, paste to rendered themes (ms) | 3389 | 2497 | 6103 |
| Main-thread tasks over 200 ms | 0 | 0 | 0 |
| Longest main-thread task (ms) | 0 | 0 | 0 |
| Peak memory (GB) | 0.80 | 0.72 | 0.73 |

Max notes (500): pipeline 11.5 s (cluster stage 1153 ms); through the interface 11.6 s, longest main-thread task 0 ms (measured from the click; the browser's own work filling the text box with 500 lines took up to 271 ms and is not counted).

Long-task observer self-test: a deliberate 300 ms task was detected (282 ms).

Generated labels are not implemented yet: every theme name is keyphrase-based, so label counts are 0.

## Method

- cold: fresh browser profile per run; each response delayed by its size at 50 Mbit/s after fetching (parallel downloads overlap, so this approximates a shared link rather than shaping traffic)
- warm: model files cached; a new page per run (as on a repeat visit), so the model is loaded from cache each time; pipeline driven through a test hook
- ui: one run per dataset through the real interface (paste, click, wait until the themes render) to include rendering; time counts from the paste, main-thread blocking from the click (filling the text box is the browser's own work and is reported separately)
- memory: peak proportional set size (PSS, shared pages split) of the browser and all its processes, sampled every 100 ms
- longTasks: main-thread blocking measured by a 20 ms heartbeat on the page: each gap between ticks beyond 20 ms counts as a task of that length (the Long Tasks API reports nothing in headless Chromium); validated by a deliberate 300 ms task before the runs
- backend: WebAssembly (headless browsers have no GPU adapter)
- maxNotes: 500 notes: the 246 unique dataset notes repeated; timing only
