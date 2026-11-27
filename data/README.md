# Datasets

Three synthetic datasets used for the demo, tests and benchmarks. Every note carries a ground-truth `theme`, so clustering quality can be measured against known answers rather than described.

| File | Notes | Themes | Subject areas | Noisy notes | Used for |
|---|---|---|---|---|---|
| `sample.json` | 50 | 5 | bakery menu brainstorm | 0 | the demo sample and quality benchmarks |
| `test.json` | 16 | 4 | bakery menu brainstorm | 0 | fast automated tests |
| `stress.json` | 180 | 15 | bakery menu brainstorm, café service, catering | 46 (26%) | scale and robustness: more notes than the agglomerative-clustering limit, neighbouring topics, messy text |

Themes:

- Bakery menu brainstorm: new recipes, failed attempts, client favorites, seasonal products, pricing and costs
- Café service: wait times, staff friendliness, seating and ambience, order accuracy, payment and app
- Catering: event orders, delivery logistics, dietary requests, quotes and pricing, setup feedback

## Format

```json
{ "name": "…", "notes": [ { "id": "s001", "text": "…", "theme": "new recipes", "domain": "bakery menu brainstorm", "author": "P2", "noisy": false } ] }
```

`author` values are placeholders (`P1`–`P6`); no note describes a real person. `noisy` marks notes written as quick, messy jottings (lowercase starts, abbreviations such as "w/" or "ppl", missing apostrophes, fragments). Notes are interleaved across themes so file order carries no signal.

## Provenance

| Item | Value |
|---|---|
| Owner | Vinicius Morais |
| Method | Drafted with AI assistance from the written brief below, then reviewed and approved by the owner |
| Brief | Subject area: bakery menu brainstorm. Themes: new recipes, failed attempts, client favorites, seasonal products, plus pricing and costs. Stress set adds two neighbouring subject areas, café service and catering, with five themes each and at least 20% noisy notes. |
| Approval | Approved by the owner on 2026-11-27 ([comment on #5](https://github.com/vini-portfolio/grounded-themes/pull/5#issuecomment-7230365001)) |

`npm run check:data` validates the files: counts, required fields, unique IDs and texts, theme and domain counts, and the noisy-note share.
