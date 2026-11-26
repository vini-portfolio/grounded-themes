# Benchmark 2026-11-26-ci-committed

**Not the reference setup**: indicative only; published figures come from reference runs.

| | |
|---|---|
| Date | 2026-11-26T22:57:28.170Z |
| Commit | 0348d85 (CI run vini-portfolio/grounded-themes/actions/runs/45907930009) |
| Machine | AMD EPYC 9V74 80-Core Processor, 4 cores, 16 GB, linux/x64 |
| Browser | chromium 159.0.8154.6 (headless) |
| Model | Xenova/bge-small-en-v1.5 @ ea104da (q8) |
| Constants | REDUCED_DIMENSIONS=28, K_MAX=12, MIN_NOTES_PER_THEME=6, MIN_CLUSTER_SIZE=3, AGGLOMERATIVE_MAX_N=150, KMEANS_RUNS=30 |
| Runs | 3 cold and 10 warm runs per dataset (warm seeds 42, 43, 44, 45, 46, 47, 48, 49, 50, 51), one run through the interface per dataset |

## Budgets

| Budget | Threshold | Measured | Verdict |
|---|---|---|---|
| Warm run, demo sample (mean) | ≤ 20 s | 3.5 s | pass |
| Cold run, demo sample, 50 Mbit/s (mean) | ≤ 90 s | 21.9 s | pass |
| Total model download | ≤ 300 MB | 58.8 MB | pass |
| Peak memory, demo sample (laptop) | ≤ 2 GB | 0.83 GB (PSS) | pass |
| Peak memory (iPhone) | ≤ 1 GB | measured by hand with Safari Web Inspector | not measured |
| Warm run, 500 notes (through the interface) | ≤ 40 s | 12.5 s | pass |
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
| Total time (ms) | 3464 (2994–3894) | 2473 (1794–2640) | 5437 (5008–5771) |
| Model load from cache (ms) | 1090 (1030–1272) | 1060 (1029–1105) | 1071 (996–1117) |
| Stage embed (ms) | 1884 (1517–2122) | 1020 (481–1110) | 3181 (2744–3546) |
| Stage reduce (ms) | 24 (16–42) | 13 (4–28) | 88 (78–96) |
| Stage cluster (ms) | 52 (34–106) | 17 (3–58) | 330 (313–359) |
| Stage extract (ms) | 373 (280–540) | 325 (173–450) | 685 (517–742) |
| Stage label (ms) | 0 (0–0) | 0 (0–0) | 0 (0–0) |
| Stage project (ms) | 6 (5–7) | 2 (1–3) | 48 (44–65) |
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
| Peak memory (GB) | 0.73 (0.69–0.82) | 0.75 (0.71–0.79) | 0.75 (0.70–0.79) |
| Main-thread tasks over 200 ms | 0 (0–0) | 0 (0–0) | 0 (0–0) |

## Cold runs per dataset (mean, range)

| Metric | sample | test | stress |
|---|---|---|---|
| Total time (ms) | 21944 (21865–22064) | 21293 (20594–21855) | 24570 (24220–25091) |
| Download and model load (ms) | 19486 (19426–19527) | 19921 (19669–20139) | 20039 (19949–20179) |
| Stage embed (ms) | 1868 (1749–2050) | 887 (485–1101) | 3130 (2880–3492) |
| Stage reduce (ms) | 20 (16–27) | 14 (4–24) | 87 (79–99) |
| Stage cluster (ms) | 37 (34–43) | 20 (3–34) | 339 (336–344) |
| Stage extract (ms) | 346 (340–353) | 253 (161–396) | 735 (719–747) |
| Stage label (ms) | 0 (0–0) | 0 (0–0) | 0 (0–0) |
| Stage project (ms) | 6 (5–7) | 2 (2–2) | 49 (45–57) |
| Model files downloaded (MB) | 58.8 (58.8–58.8) | 58.8 (58.8–58.8) | 58.8 (58.8–58.8) |
| Peak memory (GB) | 0.78 (0.70–0.83) | 0.75 (0.72–0.79) | 0.74 (0.72–0.78) |

## Through the interface (one run per dataset)

| Metric | sample | test | stress |
|---|---|---|---|
| Total time, paste to rendered themes (ms) | 3883 | 2407 | 6113 |
| Main-thread tasks over 200 ms | 0 | 0 | 0 |
| Longest main-thread task (ms) | 0 | 0 | 0 |
| Peak memory (GB) | 0.80 | 0.71 | 0.82 |

Max notes (500): pipeline 11.3 s (cluster stage 1211 ms); through the interface 12.5 s, longest main-thread task 0 ms (measured from the click; the browser's own work filling the text box with 500 lines took up to 279 ms and is not counted).

Long-task observer self-test: a deliberate 300 ms task was detected (290 ms).

Generated labels are not implemented yet: every theme name is keyphrase-based, so label counts are 0.

## Method

- cold: fresh browser profile per run; each response delayed by its size at 50 Mbit/s after fetching (parallel downloads overlap, so this approximates a shared link rather than shaping traffic)
- warm: model files cached; a new page per run (as on a repeat visit), so the model is loaded from cache each time; pipeline driven through a test hook
- ui: one run per dataset through the real interface (paste, click, wait until the themes render) to include rendering; time counts from the paste, main-thread blocking from the click (filling the text box is the browser's own work and is reported separately)
- memory: peak proportional set size (PSS, shared pages split) of the browser and all its processes, sampled every 100 ms
- longTasks: main-thread blocking measured by a 20 ms heartbeat on the page: each gap between ticks beyond 20 ms counts as a task of that length (the Long Tasks API reports nothing in headless Chromium); validated by a deliberate 300 ms task before the runs
- backend: WebAssembly (headless browsers have no GPU adapter)
- maxNotes: 500 notes: the 246 unique dataset notes repeated; timing only
