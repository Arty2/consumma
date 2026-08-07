import AxeBuilder from '@axe-core/playwright';
import { expect, test, type Page } from '@playwright/test';

/*
 * M7. The parts a browser can judge: accessibility, the installable shell, and
 * that nothing about a list ever reaches a cache.
 *
 * The response headers in vercel.json only exist on a deploy, so they are
 * asserted against the file rather than pretended to be live here; the same
 * goes for Lighthouse. Both are in the README's deployment checklist.
 */

async function addTask(page: Page, text: string) {
	await page.keyboard.press('Escape');
	await page.getByRole('button', { name: 'Add a task' }).first().click();

	const input = page.getByRole('textbox', { name: 'New task' });
	await input.fill(text);
	await input.press('Enter');
	await page.keyboard.press('Escape');
}

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

	for (const label of ['SYNC', 'IMPORT']) {
		await page.getByRole('button', { name: label, exact: true }).click();
		await expect(page.getByRole('dialog')).toBeVisible();

		const results = await new AxeBuilder({ page })
			.withTags(['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa'])
			.analyze();

		expect(results.violations, `${label} modal`).toStrictEqual([]);

		await page.keyboard.press('Escape');
	}
});

test('the controls come first in the tab order, hidden but not unreachable', async ({ page }) => {
	/*
	 * SYNC and SHARE are scrolled off the top on open. They stay first in the
	 * DOM so tabbing reaches them and scrolls them into view.
	 *
	 * Asserted on document order plus one real Tab, rather than by pressing Tab
	 * from wherever focus happens to start — that depends on whether the page
	 * has focus at all, which is not what this test is about.
	 */
	const order = await page.evaluate(() =>
		[...document.querySelectorAll<HTMLElement>('button, input, [tabindex]:not([tabindex="-1"])')]
			.filter((el) => !(el as HTMLButtonElement).disabled)
			.map((el) => el.getAttribute('aria-label') ?? el.textContent?.trim())
	);

	expect(order.slice(0, 2)).toStrictEqual(['SYNC', 'SHARE']);

	const sync = page.getByRole('button', { name: 'SYNC', exact: true });
	await sync.focus();
	await expect(sync).toBeFocused();

	await page.keyboard.press('Tab');
	await expect(page.getByRole('button', { name: 'SHARE', exact: true })).toBeFocused();

	// And it is genuinely on screen once focused, not merely focusable.
	await expect(sync).toBeInViewport();
});

test('focus is visible, and drawn rather than coloured', async ({ page }) => {
	await page.getByRole('button', { name: 'SYNC', exact: true }).focus();

	const outline = await page
		.getByRole('button', { name: 'SYNC', exact: true })
		.evaluate((el) => getComputedStyle(el).outline);

	expect(outline).toContain('dashed');
	expect(outline).toContain('rgb(0, 0, 0)');
});

test('it is installable: a manifest, a theme colour, and drawn icons', async ({ page }) => {
	const href = await page.locator('link[rel="manifest"]').getAttribute('href');
	expect(href).toBe('/manifest.webmanifest');

	const manifest = await page.request.get('/manifest.webmanifest');
	expect(manifest.ok()).toBe(true);

	const parsed = await manifest.json();
	expect(parsed.name).toBe('Consumma');
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
