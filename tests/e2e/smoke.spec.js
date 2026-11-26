import { expect, test } from '@playwright/test';

test('landing page loads without console errors', async ({ page }) => {
  const errors = [];
  page.on('console', (msg) => {
    if (msg.type() === 'error') errors.push(msg.text());
  });
  page.on('pageerror', (err) => errors.push(err.message));

  await page.goto('/');
  await expect(page.getByRole('heading', { level: 1, name: 'Grounded Themes' })).toBeVisible();
  await expect(page.locator('#app')).toHaveAttribute('data-ready', 'true');
  expect(errors).toEqual([]);
});

test('unknown paths return 404', async ({ request }) => {
  const res = await request.get('/this-page-does-not-exist');
  expect(res.status()).toBe(404);
});
