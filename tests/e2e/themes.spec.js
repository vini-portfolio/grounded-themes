import { readFileSync } from 'node:fs';
import Ajv2020 from 'ajv/dist/2020.js';
import { coldTest, embedNotes, expect, test } from './fixtures.js';
import { MIN_CLUSTER_SIZE } from '../../src/pipeline/constants.js';
import { STAGES } from '../../src/pipeline/index.js';

const sample = JSON.parse(readFileSync(new URL('../../data/sample.json', import.meta.url), 'utf8')).notes;
const schema = JSON.parse(readFileSync(new URL('../../src/pipeline/events.schema.json', import.meta.url), 'utf8'));
const validate = new Ajv2020({ allErrors: true, strict: false }).compile(schema);

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
  test('groups the demo sample into themes with one valid event per stage', async ({ page }) => {
    await page.goto('/');
    await recordStatus(page);
    await embedNotes(page, sample.map((n) => n.text));
    const count = Number(await page.locator('#app').getAttribute('data-themes'));
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
    for (const name of ['Embedding notes…', 'Clustering into themes…', 'Extracting keyphrases…']) {
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
