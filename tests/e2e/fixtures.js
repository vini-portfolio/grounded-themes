// Test fixtures. `test` serves model files from a local cache when
// MODEL_CACHE_DIR is set (CI restores it with actions/cache), fetching and
// saving them on a miss. Privacy and cache tests import `coldTest` instead,
// which always talks to the real model host.
import { test as base, expect } from '@playwright/test';
import { createHash } from 'node:crypto';
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';

const CACHE = process.env.MODEL_CACHE_DIR;

export const test = base.extend({
  context: async ({ context }, use) => {
    if (CACHE) {
      mkdirSync(CACHE, { recursive: true });
      await context.route('https://huggingface.co/**', async (route) => {
        const key = createHash('sha256').update(route.request().url()).digest('hex');
        const body = join(CACHE, `${key}.body`);
        const meta = join(CACHE, `${key}.json`);
        if (existsSync(body) && existsSync(meta)) {
          const { status, headers } = JSON.parse(readFileSync(meta, 'utf8'));
          return route.fulfill({ status, headers, body: readFileSync(body) });
        }
        const response = await route.fetch();
        const buffer = await response.body();
        const headers = response.headers();
        delete headers['content-encoding'];
        delete headers['content-length'];
        if (response.status() === 200) {
          writeFileSync(body, buffer);
          writeFileSync(meta, JSON.stringify({ status: 200, headers }));
        }
        return route.fulfill({ status: response.status(), headers, body: buffer });
      });
    }
    await use(context);
  },
});

export const coldTest = base;
export { expect };

/** Pastes notes, runs, and waits for the embedding result. */
export async function embedNotes(page, lines) {
  await page.getByLabel('Paste notes').fill(lines.join('\n'));
  await page.getByRole('button', { name: 'Find similar notes' }).click();
  await expect(page.locator('#app')).toHaveAttribute('data-embedded', /\d+/, { timeout: 120_000 });
}

export const SAMPLE_LINES = [
  'The checkout page asks for my address twice',
  'Shipping costs only appear at the very last step',
  '',
  'I could not find where to change my delivery address',
  'Search results ignore the filters I set',
  'Filtering by size resets when I go back',
  '',
  'Support replied quickly and solved my refund',
  'The chat agent was friendly and fixed the billing error',
];
