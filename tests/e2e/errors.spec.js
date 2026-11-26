import { embedNotes, expect, test } from './fixtures.js';

const NOTES = ['first note about billing', 'second note about invoices', 'third note about refunds'];

async function paste(page) {
  await page.getByLabel('Paste notes').fill(NOTES.join('\n'));
}

test.describe('failure handling', () => {
  test('names the blocked model host and recovers on Retry', async ({ page, context }) => {
    const block = (route) => route.abort('internetdisconnected');
    await context.route('https://huggingface.co/**', block);
    let dialogs = 0;
    const errors = [];
    page.on('dialog', () => (dialogs += 1));
    page.on('console', (m) => m.type() === 'error' && errors.push(m.text()));
    await page.goto('/');
    await paste(page);
    await page.getByRole('button', { name: 'Find themes' }).click();
    const alert = page.getByRole('alert');
    await expect(alert).toContainText('huggingface.co', { timeout: 60_000 });
    await expect(page.getByLabel('Paste notes')).toBeEditable();
    // Errors still reach the console in production builds.
    expect(errors.some((e) => e.includes('Grounded Themes: network'))).toBe(true);
    await context.unroute('https://huggingface.co/**', block);
    await alert.getByRole('button', { name: 'Retry' }).click();
    await expect(page.locator('#app')).toHaveAttribute('data-embedded', '3', { timeout: 120_000 });
    expect(dialogs).toBe(0);
  });

  test('says so when storage is full, and runs without saving the model', async ({ page }) => {
    await page.goto('/');
    // The fault makes the worker's cache refuse writes with QuotaExceededError,
    // the way a full device does.
    await page.evaluate(() => window.__gtInjectFault('quota'));
    await embedNotes(page, NOTES);
    await expect(page.locator('#app')).toHaveAttribute('data-embedded', '3');
    await expect(page.getByRole('alert')).toContainText("isn't enough browser storage");
    await page.getByRole('button', { name: 'Stop trying to save the model' }).click();
    await expect(page.getByRole('alert')).toHaveCount(0);
    expect(await page.evaluate(() => window.__gtState.cache)).toBe(false);
    // The next run works without the cache.
    await embedNotes(page, ['fourth note about receipts', 'fifth note about payouts']);
    await expect(page.locator('#app')).toHaveAttribute('data-embedded', '2');
  });

  for (const [kind, text] of [
    ['crash', 'stopped unexpectedly'],
    ['oom', 'ran out of memory'],
    ['device-lost', 'graphics device was lost'],
  ]) {
    test(`explains a ${kind} failure and retries on WebAssembly`, async ({ page }) => {
      await page.goto('/');
      await embedNotes(page, NOTES); // warm the model first
      // Pretend this run uses the GPU, so the test fails unless Retry really
      // switches to WebAssembly.
      await page.evaluate((k) => {
        window.__gtState.backend = 'webgpu';
        window.__gtInjectFault(k);
      }, kind);
      await page.getByRole('button', { name: 'Find themes' }).click();
      const alert = page.getByRole('alert');
      await expect(alert).toContainText(text, { timeout: 60_000 });
      await alert.getByRole('button', { name: 'Retry' }).click();
      await expect(page.getByRole('alert')).toHaveCount(0);
      await expect(page.getByRole('status')).toContainText('3 notes embedded', { timeout: 120_000 });
      await expect(page.locator('#app')).toHaveAttribute('data-backend', 'wasm');
    });
  }

  test('explains when the browser has no WebAssembly', async ({ page, context }) => {
    const hub = [];
    context.on('request', (r) => {
      if (new URL(r.url()).host.endsWith('huggingface.co')) hub.push(r.url());
    });
    await page.addInitScript(() => {
      delete globalThis.WebAssembly;
    });
    await page.goto('/');
    await expect(page.getByRole('alert')).toContainText("doesn't support WebAssembly");
    await expect(page.getByLabel('Paste notes')).toHaveCount(0);
    expect(hub).toEqual([]);
  });
});
