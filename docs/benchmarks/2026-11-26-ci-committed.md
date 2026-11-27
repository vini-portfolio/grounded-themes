# Benchmark 2026-11-26-ci-committed

**Not the reference setup**: indicative only; published figures come from reference runs.

| | |
|---|---|
| Date | 2026-11-27T00:06:58.780Z |
| Commit | 023456c (CI run vini-portfolio/grounded-themes/actions/runs/45914774420) |
| Machine | AMD EPYC 7763 64-Core Processor, 4 cores, 16 GB, linux/x64 |
| Browser | chromium 159.0.8154.6 (headless) |
| Model | Xenova/bge-small-en-v1.5 @ ea104da (q8) |
| Constants | REDUCED_DIMENSIONS=28, K_MAX=12, MIN_NOTES_PER_THEME=6, MIN_CLUSTER_SIZE=3, AGGLOMERATIVE_MAX_N=150, KMEANS_RUNS=30 |
| Runs | 3 cold and 10 warm runs per dataset (warm seeds 42, 43, 44, 45, 46, 47, 48, 49, 50, 51), one run through the interface per dataset |

## Budgets

| Budget | Threshold | Measured | Verdict |
|---|---|---|---|
| Warm run, demo sample (mean) | ≤ 20 s | 4.2 s | pass |
| Cold run, demo sample, 50 Mbit/s (mean) | ≤ 90 s | 25.1 s | pass |
| Total model download | ≤ 300 MB | 58.8 MB | pass |
| Peak memory, demo sample (laptop) | ≤ 2 GB | 0.80 GB (PSS) | pass |
| Peak memory (iPhone) | ≤ 1 GB | measured by hand with Safari Web Inspector | not measured |
| Warm run, 500 notes (through the interface) | ≤ 40 s | 15.2 s | pass |
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
| Total time (ms) | 4218 (3874–5536) | 2813 (2257–3364) | 6544 (6013–6928) |
| Model load from cache (ms) | 1438 (1344–1695) | 1378 (1345–1418) | 1375 (1304–1615) |
| Stage embed (ms) | 2203 (1809–3225) | 1064 (567–1375) | 3738 (3347–4213) |
| Stage reduce (ms) | 37 (24–55) | 18 (5–51) | 109 (94–124) |
| Stage cluster (ms) | 59 (43–79) | 14 (4–31) | 412 (371–473) |
| Stage extract (ms) | 430 (340–511) | 294 (222–476) | 806 (629–872) |
| Stage label (ms) | 0 (0–0) | 0 (0–0) | 0 (0–0) |
| Stage project (ms) | 10 (6–24) | 3 (2–6) | 61 (54–79) |
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
| Peak memory (GB) | 0.77 (0.70–0.79) | 0.76 (0.69–0.80) | 0.77 (0.71–0.80) |
| Main-thread tasks over 200 ms | 0 (0–0) | 0 (0–0) | 0 (0–0) |

## Cold runs per dataset (mean, range)

| Metric | sample | test | stress |
|---|---|---|---|
| Total time (ms) | 25080 (24477–25392) | 24389 (24146–24627) | 28337 (28194–28502) |
| Download and model load (ms) | 21971 (21677–22142) | 22612 (22494–22785) | 22733 (22348–22999) |
| Stage embed (ms) | 2376 (2029–2576) | 1196 (1099–1362) | 3898 (3673–4252) |
| Stage reduce (ms) | 35 (18–68) | 21 (15–25) | 109 (109–110) |
| Stage cluster (ms) | 57 (48–72) | 10 (6–12) | 440 (426–453) |
| Stage extract (ms) | 423 (417–433) | 328 (235–461) | 875 (864–881) |
| Stage label (ms) | 0 (0–0) | 0 (0–0) | 0 (0–0) |
| Stage project (ms) | 7 (5–9) | 3 (2–4) | 72 (58–81) |
| Model files downloaded (MB) | 58.8 (58.8–58.8) | 58.8 (58.8–58.8) | 58.8 (58.8–58.8) |
| Peak memory (GB) | 0.75 (0.71–0.80) | 0.78 (0.77–0.79) | 0.79 (0.79–0.79) |

## Through the interface (one run per dataset)

| Metric | sample | test | stress |
|---|---|---|---|
| Total time, paste to rendered themes (ms) | 4117 | 2908 | 6577 |
| Main-thread tasks over 200 ms | 0 | 0 | 0 |
| Longest main-thread block (ms; blocks under 50 ms are not recorded) | < 50 | < 50 | < 50 |
| Peak memory (GB) | 0.72 | 0.76 | 0.81 |

Max notes (500): pipeline 13.1 s (cluster stage 1440 ms); through the interface 15.2 s, longest main-thread block under 50 ms (measured from the click; the browser's own work filling the text box with 500 lines took up to 374 ms and is not counted).

Long-task observer self-test: a deliberate 300 ms task was detected (282 ms).

Generated labels are not implemented yet: every theme name is keyphrase-based, so label counts are 0.

## Method

- cold: fresh browser profile per run; each response delayed by its size at 50 Mbit/s after fetching (parallel downloads overlap, so this approximates a shared link rather than shaping traffic)
- warm: model files cached; a new page per run (as on a repeat visit), so the model is loaded from cache each time; pipeline driven through a test hook
- ui: one run per dataset through the real interface (paste, click, wait until the themes and the whole note list are in the page) to include rendering; time counts from the paste, main-thread blocking from the click (filling the text box is the browser's own work and is reported separately)
- memory: peak proportional set size (PSS, shared pages split) of the browser and all its processes, sampled every 100 ms
- longTasks: main-thread blocking measured by a 20 ms heartbeat on the page: each gap between ticks beyond 20 ms counts as a task of that length (the Long Tasks API reports nothing in headless Chromium); validated by a deliberate 300 ms task before the runs
- backend: WebAssembly (headless browsers have no GPU adapter)
- maxNotes: 500 notes: the 246 unique dataset notes repeated; timing only
