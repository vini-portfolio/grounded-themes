# Grounded Themes

On-device NLP that turns raw research notes into themes, and shows its work.

Grounded Themes is a reimplementation, built from scratch, of my earlier prototype Sticky Insights. This version is organized around an explainable pipeline: each stage shows what it did and why it was designed that way.

> **Status:** rebuild in progress. The pipeline and explainer are being added in small pull requests. No performance or quality figures are published until the benchmark script produces them.

## Planned pipeline

| Stage | What it does |
|---|---|
| Embed | Converts each note to a sentence embedding in the browser |
| Reduce | Projects embeddings to a lower-dimensional space before clustering |
| Cluster | Compares clustering algorithms and selects the number of themes by silhouette score |
| Extract | Scores candidate keyphrases per theme |
| Label | Generates a theme label with a small language model, then validates it through quality gates with a fallback |
| Explore | Shows the themes, their notes and a 2-D semantic map |
| Evaluate | Reproducible benchmark of timings and label quality |

Design notes: [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md).

## Run locally

Requires Node.js 22 or later.

```bash
npm ci
npm run dev
```

## License

To be added.
