# Benchmark 2026-11-26-ci-committed

**Not the reference setup**: indicative only; published figures come from reference runs.

| | |
|---|---|
| Date | 2026-11-26T23:30:14.593Z |
| Commit | dee5486 (CI run vini-portfolio/grounded-themes/actions/runs/45911254497) |
| Machine | AMD EPYC 7763 64-Core Processor, 4 cores, 16 GB, linux/x64 |
| Browser | chromium 159.0.8154.6 (headless) |
| Model | Xenova/bge-small-en-v1.5 @ ea104da (q8) |
| Constants | REDUCED_DIMENSIONS=28, K_MAX=12, MIN_NOTES_PER_THEME=6, MIN_CLUSTER_SIZE=3, AGGLOMERATIVE_MAX_N=150, KMEANS_RUNS=30 |
| Runs | 3 cold and 10 warm runs per dataset (warm seeds 42, 43, 44, 45, 46, 47, 48, 49, 50, 51), one run through the interface per dataset |

## Budgets

| Budget | Threshold | Measured | Verdict |
|---|---|---|---|
| Warm run, demo sample (mean) | ≤ 20 s | 4.2 s | pass |
| Cold run, demo sample, 50 Mbit/s (mean) | ≤ 90 s | 24.7 s | pass |
| Total model download | ≤ 300 MB | 58.8 MB | pass |
| Peak memory, demo sample (laptop) | ≤ 2 GB | 0.79 GB (PSS) | pass |
| Peak memory (iPhone) | ≤ 1 GB | measured by hand with Safari Web Inspector | not measured |
| Warm run, 500 notes (through the interface) | ≤ 40 s | 14.0 s | pass |
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
| Total time (ms) | 4210 (3511–5845) | 3026 (2536–3451) | 6488 (6134–6976) |
| Model load from cache (ms) | 1425 (1320–1882) | 1355 (1282–1502) | 1367 (1334–1401) |
| Stage embed (ms) | 2180 (1572–3320) | 1221 (893–1367) | 3673 (3377–4150) |
| Stage reduce (ms) | 30 (23–41) | 10 (4–23) | 110 (95–147) |
| Stage cluster (ms) | 72 (50–133) | 11 (4–32) | 430 (384–498) |
| Stage extract (ms) | 451 (336–610) | 384 (220–530) | 801 (626–855) |
| Stage label (ms) | 0 (0–0) | 1 (0–5) | 0 (0–0) |
| Stage project (ms) | 10 (6–17) | 4 (2–9) | 66 (55–80) |
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
| Peak memory (GB) | 0.75 (0.70–0.79) | 0.75 (0.69–0.79) | 0.76 (0.70–0.79) |
| Main-thread tasks over 200 ms | 0 (0–0) | 0 (0–0) | 0 (0–0) |

## Cold runs per dataset (mean, range)

| Metric | sample | test | stress |
|---|---|---|---|
| Total time (ms) | 24671 (24441–25001) | 24247 (23952–24712) | 27600 (27223–27947) |
| Download and model load (ms) | 21758 (21694–21814) | 22480 (22350–22652) | 22112 (22052–22206) |
| Stage embed (ms) | 2188 (1966–2491) | 1184 (1119–1278) | 3824 (3494–4110) |
| Stage reduce (ms) | 29 (20–36) | 14 (8–17) | 119 (108–131) |
| Stage cluster (ms) | 51 (44–56) | 10 (4–16) | 418 (399–449) |
| Stage extract (ms) | 439 (415–485) | 342 (245–528) | 855 (846–862) |
| Stage label (ms) | 0 (0–0) | 0 (0–0) | 0 (0–0) |
| Stage project (ms) | 10 (6–17) | 3 (2–3) | 66 (55–76) |
| Model files downloaded (MB) | 58.8 (58.8–58.8) | 58.8 (58.8–58.8) | 58.8 (58.8–58.8) |
| Peak memory (GB) | 0.76 (0.71–0.79) | 0.79 (0.78–0.79) | 0.78 (0.76–0.80) |

## Through the interface (one run per dataset)

| Metric | sample | test | stress |
|---|---|---|---|
| Total time, paste to rendered themes (ms) | 4900 | 2904 | 7111 |
| Main-thread tasks over 200 ms | 0 | 0 | 0 |
| Longest main-thread block (ms; blocks under 50 ms are not recorded) | < 50 | < 50 | < 50 |
| Peak memory (GB) | 0.78 | 0.74 | 0.81 |

Max notes (500): pipeline 13.2 s (cluster stage 1406 ms); through the interface 14.0 s, longest main-thread block under 50 ms (measured from the click; the browser's own work filling the text box with 500 lines took up to 372 ms and is not counted).

Long-task observer self-test: a deliberate 300 ms task was detected (281 ms).

Generated labels are not implemented yet: every theme name is keyphrase-based, so label counts are 0.

## Method

- cold: fresh browser profile per run; each response delayed by its size at 50 Mbit/s after fetching (parallel downloads overlap, so this approximates a shared link rather than shaping traffic)
- warm: model files cached; a new page per run (as on a repeat visit), so the model is loaded from cache each time; pipeline driven through a test hook
- ui: one run per dataset through the real interface (paste, click, wait until the themes and the whole note list are in the page) to include rendering; time counts from the paste, main-thread blocking from the click (filling the text box is the browser's own work and is reported separately)
- memory: peak proportional set size (PSS, shared pages split) of the browser and all its processes, sampled every 100 ms
- longTasks: main-thread blocking measured by a 20 ms heartbeat on the page: each gap between ticks beyond 20 ms counts as a task of that length (the Long Tasks API reports nothing in headless Chromium); validated by a deliberate 300 ms task before the runs
- backend: WebAssembly (headless browsers have no GPU adapter)
- maxNotes: 500 notes: the 246 unique dataset notes repeated; timing only
