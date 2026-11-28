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
  await expect(page.getByRole('button', { name: 'Run on the sample' })).toBeFocused();
  await page.keyboard.press('Enter');
  await expect(page.locator('#app')).toHaveAttribute('data-themes', /\d+/, { timeout: 120_000 });
  const first = page.locator('button.note').first();
  await first.focus();
  await page.keyboard.press('Enter');
  await expect(first).toHaveAttribute('aria-expanded', 'true');
  await expect(page.locator('.neighbor-list li')).toHaveCount(5);
  await page.keyboard.press('Space');
  await expect(first).toHaveAttribute('aria-expanded', 'false');
});
