import { expect, test } from '@playwright/test';

test('the app builds and serves a page', async ({ page }) => {
	const response = await page.goto('/');

	expect(response?.status()).toBe(200);
	await expect(page).toHaveTitle('/consumma');
	await expect(page.locator('main[data-sheet]')).toBeAttached();
});
