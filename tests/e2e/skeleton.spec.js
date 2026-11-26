import { embedNotes, expect, SAMPLE_LINES, test } from './fixtures.js';

test.describe('paste and compare notes', () => {
  test('turns each non-empty pasted line into a note', async ({ page }) => {
    await page.goto('/');
    const lines = [...SAMPLE_LINES, 'Delivery tracking never updates'];
    await embedNotes(page, lines);
    await expect(page.locator('#app')).toHaveAttribute('data-embedded', '8');
    await expect(page.getByRole('list', { name: 'Notes' }).getByRole('listitem')).toHaveCount(8);
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
    await expect(page.locator('.notes img, .notes script')).toHaveCount(0);
    expect(await page.evaluate(() => window.__xss)).toBeUndefined();
  });

  test('reports notes shortened to the model input limit', async ({ page }) => {
    await page.goto('/');
    const long = Array.from({ length: 400 }, (_, i) => `word${i}`).join(' ');
    await embedNotes(page, ['A short note about pricing', long, 'Another short note about invoices']);
    await expect(page.getByRole('status')).toContainText("1 long note was shortened to the model's input limit");
  });
});
