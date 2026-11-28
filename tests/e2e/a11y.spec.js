import AxeBuilder from '@axe-core/playwright';
import { expect, test } from './fixtures.js';

const TAGS = ['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa', 'wcag22aa'];

async function scan(page) {
  const { violations } = await new AxeBuilder({ page }).withTags(TAGS).analyze();
  return violations.map((v) => `${v.impact} ${v.id}: ${v.nodes.map((n) => n.target.join(' ')).join(', ')}`);
}

for (const colorScheme of ['light', 'dark']) {
  test.describe(`accessibility (${colorScheme})`, () => {
    test.use({ colorScheme });

    test('landing, results and an open note have no WCAG A/AA violations found by axe', async ({ page }) => {
      await page.goto('/');
      expect(await scan(page)).toEqual([]);
      await page.getByRole('button', { name: 'Run on the sample' }).click();
      await expect(page.locator('#app')).toHaveAttribute('data-themes', /\d+/, { timeout: 120_000 });
      expect(await scan(page)).toEqual([]);
      await page.locator('button.note').first().click();
      await expect(page.locator('.neighbor-list li')).toHaveCount(5);
      expect(await scan(page)).toEqual([]);
    });
  });
}

test('the sample run and a note\'s matches work with the keyboard alone', async ({ page }) => {
  await page.goto('/');
  await page.keyboard.press('Tab');
  const sampleButton = page.getByRole('button', { name: 'Run on the sample' });
  await expect(sampleButton).toBeFocused();
  await page.keyboard.press('Enter');
  // Focus stays on the button during the run, then moves to the results.
  await expect(sampleButton).toBeFocused();
  await expect(page.locator('#app')).toHaveAttribute('data-themes', /\d+/, { timeout: 120_000 });
  await expect(page.getByRole('heading', { level: 2, name: 'Themes' })).toBeFocused();
  await page.keyboard.press('Tab');
  const first = page.locator('button.note').first();
  await expect(first).toBeFocused();
  await page.keyboard.press('Enter');
  await expect(first).toHaveAttribute('aria-expanded', 'true');
  await expect(page.locator('.neighbor-list li')).toHaveCount(5);
  await page.keyboard.press('Space');
  await expect(first).toHaveAttribute('aria-expanded', 'false');
});

test('the page reflows at 320 px without sideways scrolling, even with a long unbroken note', async ({ page }) => {
  await page.setViewportSize({ width: 320, height: 800 });
  await page.goto('/');
  const long = `https://example.com/${'a'.repeat(200)}`;
  await page.getByLabel('Paste notes').fill(`${long}\nshort note about bread\nanother note about cakes`);
  await page.getByRole('button', { name: 'Find themes' }).click();
  await expect(page.locator('#app')).toHaveAttribute('data-themes', /\d+/, { timeout: 120_000 });
  await page.getByRole('button', { name: long }).click();
  expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(320);
});
