# Grounded Themes

[![CI](https://github.com/vini-portfolio/grounded-themes/actions/workflows/ci.yml/badge.svg)](https://github.com/vini-portfolio/grounded-themes/actions/workflows/ci.yml)

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

Design notes: [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md). Runtime decisions: [docs/adr/001-runtime.md](docs/adr/001-runtime.md).

## What works today

Paste notes (one per line) and Grounded Themes groups them into themes on your device: it embeds each note, reduces the vectors with principal component analysis, compares spherical k-means with agglomerative clustering and picks the number of themes by silhouette score, then names each theme from its most distinctive keyphrases. Select any note to see its five closest matches. Everything runs in a Web Worker in your browser.

Theme names are keyphrase-based for now; validated generated labels come next.

## Network

- All code, including the ONNX Runtime WebAssembly files, is served by this site.
- Model files are downloaded once from the Hugging Face Hub (`huggingface.co` and its file CDN) and then cached by your browser.
- Note text is never sent anywhere. A browser test checks every request of a cold run for this.

## Models and licenses

| Model | Revision | License | Source |
|---|---|---|---|
| Xenova/all-MiniLM-L6-v2 (ONNX, q8) | `751bff3` | Apache-2.0 (upstream sentence-transformers/all-MiniLM-L6-v2) | [Hugging Face](https://huggingface.co/Xenova/all-MiniLM-L6-v2) |

Third-party libraries: [THIRD_PARTY_NOTICES.md](THIRD_PARTY_NOTICES.md).

## Run locally

Requires Node.js 22 or later.

```bash
npm ci
npm run dev   # copies the ONNX Runtime files into public/ort first
```

## Checks

| Command | What it does |
|---|---|
| `npm run lint` | ESLint |
| `npm run test:unit` | Unit tests (Vitest), no network |
| `npm run test:e2e` | Browser tests (Playwright) against a production build with test-only fault hooks |
| `npm run check:data` | Validates the datasets in `data/` |
| `npm run check:dist` | Checks the production build: runtime files present, no test-only hooks |
| `npm run check:weights` | Fails if a model weight file or any file over 10 MB is committed |

## License

To be added.
