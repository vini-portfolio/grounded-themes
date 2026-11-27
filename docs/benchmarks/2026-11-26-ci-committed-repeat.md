# Benchmark 2026-11-26-ci-committed-repeat

**Not the reference setup**: indicative only; published figures come from reference runs.

| | |
|---|---|
| Date | 2026-11-26T23:56:02.690Z |
| Commit | dee5486 (CI run vini-portfolio/grounded-themes/actions/runs/45911254497) |
| Machine | AMD EPYC 7763 64-Core Processor, 4 cores, 16 GB, linux/x64 |
| Browser | chromium 159.0.8154.6 (headless) |
| Model | Xenova/bge-small-en-v1.5 @ ea104da (q8) |
| Constants | REDUCED_DIMENSIONS=28, K_MAX=12, MIN_NOTES_PER_THEME=6, MIN_CLUSTER_SIZE=3, AGGLOMERATIVE_MAX_N=150, KMEANS_RUNS=30 |
| Runs | 3 cold and 10 warm runs per dataset (warm seeds 42, 43, 44, 45, 46, 47, 48, 49, 50, 51), one run through the interface per dataset |

## Budgets

| Budget | Threshold | Measured | Verdict |
|---|---|---|---|
| Warm run, demo sample (mean) | ≤ 20 s | 3.9 s | pass |
| Cold run, demo sample, 50 Mbit/s (mean) | ≤ 90 s | 24.7 s | pass |
| Total model download | ≤ 300 MB | 58.8 MB | pass |
| Peak memory, demo sample (laptop) | ≤ 2 GB | 0.80 GB (PSS) | pass |
| Peak memory (iPhone) | ≤ 1 GB | measured by hand with Safari Web Inspector | not measured |
| Warm run, 500 notes (through the interface) | ≤ 40 s | 14.5 s | pass |
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
| Total time (ms) | 3928 (3587–4370) | 2988 (2617–3267) | 6753 (6188–7111) |
| Model load from cache (ms) | 1349 (1288–1472) | 1358 (1301–1396) | 1340 (1287–1382) |
| Stage embed (ms) | 2004 (1678–2472) | 1200 (974–1356) | 3972 (3357–4352) |
| Stage reduce (ms) | 34 (19–79) | 10 (3–32) | 109 (92–123) |
| Stage cluster (ms) | 71 (46–98) | 11 (4–39) | 420 (384–438) |
| Stage extract (ms) | 422 (333–537) | 363 (217–540) | 807 (636–888) |
| Stage label (ms) | 0 (0–0) | 0 (0–0) | 0 (0–0) |
| Stage project (ms) | 8 (6–22) | 3 (2–14) | 65 (56–80) |
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
| Peak memory (GB) | 0.75 (0.69–0.79) | 0.76 (0.70–0.79) | 0.77 (0.70–0.79) |
| Main-thread tasks over 200 ms | 0 (0–0) | 0 (0–0) | 0 (0–0) |

## Cold runs per dataset (mean, range)

| Metric | sample | test | stress |
|---|---|---|---|
| Total time (ms) | 24698 (24366–24908) | 24534 (24173–24796) | 27877 (27333–28287) |
| Download and model load (ms) | 22030 (21734–22207) | 22461 (22083–22773) | 22226 (22062–22382) |
| Stage embed (ms) | 1958 (1931–1977) | 1353 (1323–1394) | 4003 (3594–4255) |
| Stage reduce (ms) | 34 (24–41) | 15 (5–25) | 107 (105–110) |
| Stage cluster (ms) | 48 (43–55) | 13 (5–26) | 405 (400–415) |
| Stage extract (ms) | 419 (410–425) | 488 (446–532) | 873 (847–894) |
| Stage label (ms) | 0 (0–0) | 0 (0–0) | 0 (0–0) |
| Stage project (ms) | 8 (6–13) | 3 (2–3) | 58 (55–62) |
| Model files downloaded (MB) | 58.8 (58.8–58.8) | 58.8 (58.8–58.8) | 58.8 (58.8–58.8) |
| Peak memory (GB) | 0.79 (0.78–0.79) | 0.76 (0.72–0.79) | 0.75 (0.72–0.79) |

## Through the interface (one run per dataset)

| Metric | sample | test | stress |
|---|---|---|---|
| Total time, paste to rendered themes (ms) | 3932 | 3441 | 7394 |
| Main-thread tasks over 200 ms | 0 | 0 | 0 |
| Longest main-thread block (ms; blocks under 50 ms are not recorded) | < 50 | < 50 | < 50 |
| Peak memory (GB) | 0.80 | 0.81 | 0.81 |

Max notes (500): pipeline 13.6 s (cluster stage 1403 ms); through the interface 14.5 s, longest main-thread block under 50 ms (measured from the click; the browser's own work filling the text box with 500 lines took up to 370 ms and is not counted).

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
