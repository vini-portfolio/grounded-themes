import { embedNotes, expect, test } from './fixtures.js';

const NOTES = ['first note about billing', 'second note about invoices', 'third note about refunds'];

async function paste(page) {
  await page.getByLabel('Paste notes').fill(NOTES.join('\n'));
}

test.describe('failure handling', () => {
  test('names the blocked model host and recovers on Retry', async ({ page, context }) => {
    const block = (route) => route.abort('internetdisconnected');
    await context.route('https://huggingface.co/**', block, { times: 1000 });
    let dialogs = 0;
    page.on('dialog', () => (dialogs += 1));
    await page.goto('/');
    await paste(page);
    await page.getByRole('button', { name: 'Find similar notes' }).click();
    const alert = page.getByRole('alert');
    await expect(alert).toContainText('huggingface.co', { timeout: 60_000 });
    await expect(page.getByLabel('Paste notes')).toBeEditable();
    await context.unroute('https://huggingface.co/**', block);
    await alert.getByRole('button', { name: 'Retry' }).click();
    await expect(page.locator('#app')).toHaveAttribute('data-embedded', '3', { timeout: 120_000 });
    expect(dialogs).toBe(0);
  });

  test('offers to run without saving the model when storage is full', async ({ page }) => {
    await page.goto('/');
    await page.evaluate(() => window.__gtInjectFault('quota'));
    await paste(page);
    await page.getByRole('button', { name: 'Find similar notes' }).click();
    await expect(page.getByRole('alert')).toContainText("isn't enough browser storage");
    await page.getByRole('button', { name: 'Run without saving the model' }).click();
    await expect(page.locator('#app')).toHaveAttribute('data-embedded', '3', { timeout: 120_000 });
  });

  for (const [kind, text] of [
    ['crash', 'stopped unexpectedly'],
    ['oom', 'ran out of memory'],
    ['device-lost', 'graphics device was lost'],
  ]) {
    test(`explains a ${kind} failure and retries on WebAssembly`, async ({ page }) => {
      await page.goto('/');
      await embedNotes(page, NOTES); // warm the model first
      await page.evaluate((k) => window.__gtInjectFault(k), kind);
      await page.getByRole('button', { name: 'Find similar notes' }).click();
      const alert = page.getByRole('alert');
      await expect(alert).toContainText(text, { timeout: 60_000 });
      await alert.getByRole('button', { name: 'Retry' }).click();
      await expect(page.getByRole('alert')).toHaveCount(0);
      await expect(page.getByRole('status')).toContainText('3 notes embedded', { timeout: 120_000 });
      expect(await page.evaluate(() => window.__gtState.backend)).toBe('wasm');
    });
  }

  test('explains when the browser has no WebAssembly', async ({ page }) => {
    await page.addInitScript(() => {
      delete globalThis.WebAssembly;
    });
    await page.goto('/');
    await expect(page.getByRole('alert')).toContainText("doesn't support WebAssembly");
    await expect(page.getByLabel('Paste notes')).toHaveCount(0);
  });
});
