// Compares embedding models (and clustering on reduced vs full vectors) on the
// datasets with ground-truth themes. Run with: npm run experiment:embeddings
import { readFileSync } from 'node:fs';
import { expect, test } from '@playwright/test';
import { CANDIDATES } from './models.js';
import { adjustedRandIndex, normalizedMutualInfo } from './metrics.js';

const load = (name) => JSON.parse(readFileSync(new URL(`../../data/${name}.json`, import.meta.url), 'utf8')).notes;
const DATASETS = { sample: load('sample'), test: load('test'), stress: load('stress') };
const DESIGNS = [
  { key: 'pca28', pipelineOptions: {} },
  { key: 'full', pipelineOptions: { reducedDimensions: null } },
];
const only = process.env.MODELS ? process.env.MODELS.split(',') : null;

for (const model of CANDIDATES.filter((m) => !only || only.includes(m.key))) {
  test(`embedding model ${model.key}`, async ({ page }) => {
    test.setTimeout(20 * 60_000);
    await page.goto('/');
    for (const design of DESIGNS) {
      for (const [name, notes] of Object.entries(DATASETS)) {
        const r = await page.evaluate(
          ([texts, m, opts]) => window.__gtExperiment(texts, { model: m, pipelineOptions: opts, backend: 'wasm' }),
          [notes.map((n) => n.text), model, design.pipelineOptions],
        );
        const truth = notes.map((n) => n.theme);
        const row = {
          model: model.key,
          design: design.key,
          dataset: name,
          themes: Math.max(...r.assignments) + 1,
          trueThemes: new Set(truth).size,
          ari: Number(adjustedRandIndex(r.assignments, truth).toFixed(3)),
          nmi: Number(normalizedMutualInfo(r.assignments, truth).toFixed(3)),
          selected: r.cluster,
          ms: r.ms,
          embedMs: r.stageMs.embed,
          downloadedMB: Number((r.downloadedBytes / 1048576).toFixed(1)),
          labels: name === 'sample' ? r.labels : undefined,
        };
        if (name === 'stress') {
          // Agreement at the subject-area level too (bakery / café / catering).
          row.domainAri = Number(adjustedRandIndex(r.assignments, notes.map((n) => n.domain)).toFixed(3));
        }
        console.log(`EXPERIMENT ${JSON.stringify(row)}`);
        expect(r.modelId).toBe(model.id);
      }
    }
  });
}
