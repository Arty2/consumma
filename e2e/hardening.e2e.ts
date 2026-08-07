import AxeBuilder from '@axe-core/playwright';
import { expect, test } from '@playwright/test';
import { fromMenu, menuButton, openMenu, addTask } from './app';

/*
 * M7. The parts a browser can judge: accessibility, the installable shell, and
 * that nothing about a list ever reaches a cache.
 *
 * The response headers in vercel.json only exist on a deploy, so they are
 * asserted against the file rather than pretended to be live here; the same
 * goes for Lighthouse. Both are in the README's deployment checklist.
 */

test.beforeEach(async ({ page }) => {
	await page.goto('/');
	await page.evaluate(() => localStorage.clear());
	await page.reload();
});

test('the sheet has no accessibility violations', async ({ page }) => {
	await addTask(page, 'Bread');
	await addTask(page, 'Coffee, the dark one');
	await page.getByRole('checkbox', { name: 'Bread' }).click();

	const results = await new AxeBuilder({ page })
		.withTags(['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa'])
		.analyze();

	expect(results.violations).toStrictEqual([]);
});

test('the modals have no accessibility violations either', async ({ page, context }) => {
	await context.grantPermissions(['clipboard-read', 'clipboard-write']);

	const open = [() => openMenu(page), () => fromMenu(page, 'Import')];

	for (const [index, click] of open.entries()) {
		await click();
		await expect(page.getByRole('dialog')).toBeVisible();

		const results = await new AxeBuilder({ page })
			.withTags(['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa'])
			.analyze();

		expect(results.violations, `modal ${index}`).toStrictEqual([]);

		await page.keyboard.press('Escape');
	}
});

test('the sheet is reachable and operable with a keyboard alone', async ({ page }) => {
	await addTask(page, 'Bread');

	// The burger is the only way to anything that is not the list, so it has to
	// be reachable and operable without a pointer.
	const button = menuButton(page);
	await button.focus();
	await expect(button).toBeFocused();

	await page.keyboard.press('Enter');
	await expect(page.getByRole('dialog', { name: 'Menu' })).toBeVisible();

	await page.keyboard.press('Escape');
	await expect(button).toBeFocused();
});

test('focus is visible, and drawn rather than coloured', async ({ page }) => {
	const first = menuButton(page);
	await first.focus();

	const outline = await first.evaluate((el) => getComputedStyle(el).outline);

	expect(outline).toContain('dashed');
	expect(outline).toContain('rgb(0, 0, 0)');
});

test('it is installable: a manifest, a theme colour, and drawn icons', async ({ page }) => {
	const href = await page.locator('link[rel="manifest"]').getAttribute('href');
	expect(href).toBe('/manifest.webmanifest');

	const manifest = await page.request.get('/manifest.webmanifest');
	expect(manifest.ok()).toBe(true);

	const parsed = await manifest.json();
	expect(parsed.name).toBe('/consumma');
	expect(parsed.display).toBe('standalone');
	// White, so the toolbar tint does not break the sheet-of-paper illusion.
	expect(parsed.theme_color).toBe('#ffffff');
	expect(parsed.icons.some((i: { purpose?: string }) => i.purpose === 'maskable')).toBe(true);

	for (const icon of parsed.icons) {
		const response = await page.request.get(icon.src);
		expect(response.ok(), icon.src).toBe(true);
		expect(response.headers()['content-type']).toContain('image/png');
	}

	// iOS has no install prompt, so the touch icon has to be there.
	const apple = await page.request.get('/icons/apple-touch-icon.png');
	expect(apple.ok()).toBe(true);
});

test('the service worker caches the shell and never an API response', async ({ page }) => {
	await addTask(page, 'Bread');

	await page.waitForFunction(() => navigator.serviceWorker?.controller !== null, null, {
		timeout: 10_000
	});

	const cached = await page.evaluate(async () => {
		const names = await caches.keys();
		const out: string[] = [];

		for (const name of names) {
			const cache = await caches.open(name);
			for (const request of await cache.keys()) out.push(new URL(request.url).pathname);
		}
		return out;
	});

	expect(cached.length).toBeGreaterThan(0);
	// A stale ciphertext served from a cache would look exactly like someone
	// else's edit vanishing.
	expect(cached.filter((path) => path.startsWith('/api/'))).toStrictEqual([]);
});

test('it opens offline, from what is on the device', async ({ page, context }) => {
	await addTask(page, 'Bread');
	await addTask(page, 'Coffee');

	await page.waitForFunction(() => navigator.serviceWorker?.controller !== null, null, {
		timeout: 10_000
	});

	// A cold start with the aeroplane mode on.
	await context.setOffline(true);
	await page.reload();

	await expect(page.getByRole('checkbox', { name: 'Bread' })).toBeVisible();
	await expect(page.getByRole('checkbox', { name: 'Coffee' })).toBeVisible();

	// And it is still fully usable, not merely readable.
	await addTask(page, 'Milk');
	await expect(page.getByRole('checkbox', { name: 'Milk' })).toBeVisible();

	await context.setOffline(false);
});
