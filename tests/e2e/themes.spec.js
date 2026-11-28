import { readFileSync } from 'node:fs';
import Ajv2020 from 'ajv/dist/2020.js';
import { coldTest, embedNotes, expect, test } from './fixtures.js';
import { MIN_CLUSTER_SIZE } from '../../src/pipeline/constants.js';
import { STAGES } from '../../src/pipeline/index.js';

const sample = JSON.parse(readFileSync(new URL('../../data/sample.json', import.meta.url), 'utf8')).notes;
const schema = JSON.parse(readFileSync(new URL('../../src/pipeline/events.schema.json', import.meta.url), 'utf8'));
const validate = new Ajv2020({ allErrors: true, strict: false }).compile(schema);

/** Adjusted Rand Index between two labelings (for the log only). */
function adjustedRandIndex(a, b) {
  const pairs = (x) => (x * (x - 1)) / 2;
  const table = new Map();
  const ra = new Map();
  const rb = new Map();
  a.forEach((x, i) => {
    const key = `${x}|${b[i]}`;
    table.set(key, (table.get(key) ?? 0) + 1);
    ra.set(x, (ra.get(x) ?? 0) + 1);
    rb.set(b[i], (rb.get(b[i]) ?? 0) + 1);
  });
  const index = [...table.values()].reduce((s, v) => s + pairs(v), 0);
  const sa = [...ra.values()].reduce((s, v) => s + pairs(v), 0);
  const sb = [...rb.values()].reduce((s, v) => s + pairs(v), 0);
  const expected = (sa * sb) / pairs(a.length);
  const max = (sa + sb) / 2;
  return Math.round(((index - expected) / (max - expected)) * 1000) / 1000;
}

/** Records every text the status line shows. */
async function recordStatus(page) {
  await page.evaluate(() => {
    window.__statusLog = [];
    const el = document.querySelector('[role="status"]');
    new MutationObserver(() => window.__statusLog.push(el.textContent)).observe(el, {
      childList: true,
      characterData: true,
      subtree: true,
    });
  });
}

test.describe('themes', () => {
  test('one click on "Run on the sample" loads and groups the demo sample', async ({ page }) => {
    await page.goto('/');
    await page.getByRole('button', { name: 'Run on the sample' }).click();
    await expect(page.getByLabel('Paste notes')).toHaveValue(sample.map((n) => n.text).join('\n'));
    await expect(page.locator('#app')).toHaveAttribute('data-embedded', String(sample.length), { timeout: 120_000 });
    await expect(page.locator('#app')).toHaveAttribute('data-themes', /^[1-9]\d*$/);
    await expect(page.getByRole('button', { name: 'Run on the sample' })).toBeEnabled();
  });

  test('groups the demo sample into themes with one valid event per stage', async ({ page }) => {
    await page.goto('/');
    await recordStatus(page);
    await embedNotes(page, sample.map((n) => n.text));
    const count = Number(await page.locator('#app').getAttribute('data-themes'));
    // Report what the real model produced, for tuning (not asserted here).
    const summary = await page.evaluate(() => {
      const c = window.__gtState.events.find((e) => e.stage === 'cluster').payload;
      return { selected: c.selected, merges: c.merges.length, assignments: c.assignments, labels: window.__gtState.themes.map((t) => `${t.label} (${t.noteIndexes.length})`) };
    });
    summary.ari = adjustedRandIndex(summary.assignments, sample.map((n) => n.theme));
    delete summary.assignments;
    console.log(`demo sample themes: ${JSON.stringify(summary)}`);
    expect(count).toBeGreaterThanOrEqual(2);
    await expect(page.locator('.theme')).toHaveCount(count);
    for (const theme of await page.locator('.theme').all()) {
      await expect(theme.getByRole('heading', { level: 3 })).not.toHaveText('');
      expect(await theme.locator('.theme-notes li').count()).toBeGreaterThanOrEqual(MIN_CLUSTER_SIZE);
    }
    const events = await page.evaluate(() => window.__gtState.events);
    expect(events.map((e) => e.stage)).toEqual(STAGES);
    for (const e of events) expect(validate(e), JSON.stringify(validate.errors)).toBe(true);
    const shown = await page.evaluate(() => window.__statusLog);
    for (const name of [
      'Embedding notes…',
      'Reducing dimensions…',
      'Clustering into themes…',
      'Extracting keyphrases…',
      'Naming themes…',
      'Computing note positions…',
    ]) {
      expect(shown).toContain(name);
    }
  });

  test('writes nothing to console.log in production unless ?debug=1', async ({ page }) => {
    const logs = [];
    page.on('console', (m) => m.type() === 'log' && logs.push(m.text()));
    await page.goto('/');
    await embedNotes(page, sample.slice(0, 12).map((n) => n.text));
    expect(logs).toEqual([]);
    await page.goto('/?debug=1');
    await embedNotes(page, sample.slice(0, 12).map((n) => n.text));
    expect(logs.some((l) => l.includes('stage cluster'))).toBe(true);
  });
});

coldTest('shows download progress on the first run', async ({ page }) => {
  await page.goto('/');
  await recordStatus(page);
  await embedNotes(page, sample.slice(0, 8).map((n) => n.text));
  const shown = await page.evaluate(() => window.__statusLog);
  expect(shown.some((t) => /^Downloading the model: \d+\.\d of at least \d+\.\d MB$/.test(t))).toBe(true);
});
