import { embedNotes, expect, SAMPLE_LINES, test } from './fixtures.js';

test.describe('paste and compare notes', () => {
  test('turns each non-empty pasted line into a note', async ({ page }) => {
    await page.goto('/');
    const lines = [...SAMPLE_LINES, 'Delivery tracking never updates'];
    await embedNotes(page, lines);
    await expect(page.locator('#app')).toHaveAttribute('data-embedded', '8');
    await expect(page.locator('button.note')).toHaveCount(8);
  });

  test('embeds every note as a unit-length 384-dimension vector', async ({ page }) => {
    await page.goto('/');
    await embedNotes(page, SAMPLE_LINES);
    const stats = await page.evaluate(() =>
      window.__gtState.vectors.map((v) => ({ dims: v.length, norm: Math.hypot(...v) })),
    );
    expect(stats).toHaveLength(7);
    for (const s of stats) {
      expect(s.dims).toBe(384);
      expect(Math.abs(s.norm - 1)).toBeLessThan(1e-6);
    }
  });

  test('lists the five most similar notes with two-decimal similarity', async ({ page }) => {
    await page.goto('/');
    await embedNotes(page, SAMPLE_LINES);
    await page.getByRole('button', { name: SAMPLE_LINES[0] }).click();
    const items = page.locator('.neighbor-list li');
    await expect(items).toHaveCount(5);
    for (const text of await page.locator('.neighbor-list .similarity').allTextContents()) {
      expect(text).toMatch(/^-?\d\.\d{2}$/);
    }
    // The closest match to a checkout complaint should be another checkout or address note.
    await expect(items.first()).toContainText(/address|Shipping/);
  });

  test('shows note text literally, never as markup', async ({ page }) => {
    await page.goto('/');
    const payloads = [
      '<img src=x onerror="window.__xss=1">',
      '<script>window.__xss=2</script>',
      'A normal note about onboarding emails',
    ];
    await embedNotes(page, payloads);
    await expect(page.getByRole('button', { name: payloads[0] })).toBeVisible();
    await page.getByRole('button', { name: payloads[1] }).click();
    await expect(page.getByRole('button', { name: payloads[1] })).toHaveAttribute('aria-expanded', 'true');
    await expect(page.locator('.neighbor-list')).toContainText(payloads[0]);
    await expect(page.locator('#app img, #app script')).toHaveCount(0);
    expect(await page.evaluate(() => window.__xss)).toBeUndefined();
  });

  test('truncates long notes to the model input limit and says how many', async ({ page }) => {
    await page.goto('/');
    // About 300 tokens: past the 256-token limit but well short of 512, so the
    // different ending in the second note starts after token 256 and before
    // the tokenizer's own 512 limit. Both embed identically only if input is
    // cut at 256.
    const long = Array.from({ length: 100 }, (_, i) => `checkout${i % 7} delay`).join(' ');
    const longWithTail = `${long} ${'dolphins swim near the coral reef '.repeat(30)}`;
    await embedNotes(page, ['A short note about pricing', long, longWithTail, 'Another short note about invoices']);
    await expect(page.getByRole('status')).toContainText("2 long notes were shortened to the model's input limit");
    const similarity = await page.evaluate(() => {
      const [, a, b] = window.__gtState.vectors;
      return a.reduce((sum, x, i) => sum + x * b[i], 0);
    });
    expect(similarity).toBeGreaterThan(0.9999);
  });

  test('note buttons stay disabled until their embeddings are ready', async ({ page }) => {
    await page.goto('/');
    await embedNotes(page, ['first note about billing', 'second note about invoices']);
    await page.getByLabel('Paste notes').fill('third note about refunds\nfourth note about receipts');
    // Start the run and read the note buttons in the same task, before any
    // embedding result can arrive.
    const disabled = await page.evaluate(() => {
      [...document.querySelectorAll('button')].find((b) => b.textContent === 'Find themes').click();
      return [...document.querySelectorAll('.note')].map((b) => b.disabled);
    });
    // No note can be selected before its embedding exists.
    expect(disabled.filter((d) => !d)).toEqual([]);
    await expect(page.locator('#app')).toHaveAttribute('data-embedded', '2', { timeout: 120_000 });
    await expect(page.getByRole('button', { name: 'third note about refunds' })).toBeEnabled();
  });
});
