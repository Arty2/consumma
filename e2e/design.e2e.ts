import { expect, test } from '@playwright/test';

/*
 * M2's acceptance, as far as a browser can check it: two colours and nothing
 * else, every mark an inline SVG path, no images anywhere, and a page that
 * fits 320px without scrolling sideways.
 */

test.beforeEach(async ({ page }) => {
	await page.goto('/');
	await page.evaluate(() => localStorage.clear());
	await page.reload();
});

test('every mark on the page is a drawn path, not an image', async ({ page }) => {
	await expect(page.locator('img')).toHaveCount(0);

	const backgrounds = await page.evaluate(() =>
		[...document.querySelectorAll('*')]
			.map((el) => getComputedStyle(el).backgroundImage)
			.filter((value) => value !== 'none')
	);
	expect(backgrounds).toStrictEqual([]);

	// The torn edges, the boxes and the ellipsis rows are all SVG paths.
	expect(await page.locator('svg path').count()).toBeGreaterThan(2);
});

test('nothing casts a shadow, because a shadow means grey', async ({ page }) => {
	const shadows = await page.evaluate(() =>
		[...document.querySelectorAll('*')]
			.map((el) => getComputedStyle(el).boxShadow)
			.filter((value) => value !== 'none')
	);

	expect(shadows).toStrictEqual([]);
});

test('the palette is black on white and nothing else', async ({ page }) => {
	await page.getByRole('button', { name: 'Add a task' }).click();
	const input = page.getByRole('textbox', { name: 'New task' });
	await input.fill('Bread');
	await input.press('Enter');
	await page.keyboard.press('Escape');

	const colours = await page.evaluate(() => {
		const seen = new Set<string>();

		for (const el of document.querySelectorAll('*')) {
			const style = getComputedStyle(el);
			for (const value of [style.color, style.backgroundColor, style.borderTopColor]) {
				// Fully transparent is not a colour anyone can see.
				if (value === 'rgba(0, 0, 0, 0)' || value === 'transparent') continue;
				seen.add(value);
			}
		}
		return [...seen];
	});

	for (const colour of colours) {
		const [r, g, b] = colour.match(/\d+/g)!.slice(0, 3).map(Number);
		// Greyscale only: a colour would have channels that disagree.
		expect(r).toBe(g);
		expect(g).toBe(b);
	}
});

test('the sheet is drawn with the handwritten faces, served from our origin', async ({ page }) => {
	const fonts = await page.evaluate(() =>
		[...document.fonts].map((f) => ({ family: f.family, status: f.status }))
	);

	expect(fonts.map((f) => f.family)).toContain('Patrick Hand');
	expect(fonts.map((f) => f.family)).toContain('Caveat');
});

test('works at 320px without scrolling sideways', async ({ page }) => {
	await page.setViewportSize({ width: 320, height: 720 });

	await page.getByRole('button', { name: 'Add a task' }).click();
	const input = page.getByRole('textbox', { name: 'New task' });
	await input.fill('Something rather long that has to wrap on a narrow phone');
	await input.press('Enter');
	await page.keyboard.press('Escape');

	const overflows = await page.evaluate(
		() => document.documentElement.scrollWidth > document.documentElement.clientWidth
	);
	expect(overflows).toBe(false);

	// Each action row still fits on one line.
	for (const label of ['IMPORT', 'EXPORT', 'DELETE', 'CLEAR']) {
		const box = await page.getByRole('button', { name: label, exact: true }).boundingBox();
		expect(box!.height).toBeLessThan(70);
	}
});

test('a drawn line does not move when the row around it re-renders', async ({ page }) => {
	await page.getByRole('button', { name: 'Add a task' }).click();
	const input = page.getByRole('textbox', { name: 'New task' });
	await input.fill('Bread');
	await input.press('Enter');
	await page.keyboard.press('Escape');

	const box = page.getByRole('checkbox', { name: 'Bread' }).locator('path').first();
	const before = await box.getAttribute('d');

	// Ticking re-renders the row and adds two strokes to the same box.
	await page.getByRole('checkbox', { name: 'Bread' }).click();
	const after = await box.getAttribute('d');

	expect(after).toBe(before);
});

test('the app opens on the list, with the torn edge whole and not clipped', async ({ page }) => {
	await page.getByRole('button', { name: 'Add a task' }).click();
	const input = page.getByRole('textbox', { name: 'New task' });
	for (const text of ['Bread', 'Coffee', 'Milk']) {
		await input.fill(text);
		await input.press('Enter');
	}
	await page.keyboard.press('Escape');

	await page.reload();
	await expect(page.getByRole('checkbox', { name: 'Bread' })).toBeVisible();

	// Nothing sits above the sheet, so the page opens where it starts.
	expect(await page.evaluate(() => window.scrollY)).toBe(0);

	/*
	 * The tear is drawn to the edges of its own box and stroked on the path, so
	 * half the stroke falls outside it. There has to be room above for that, or
	 * the peaks come off flat against the top of the viewport.
	 */
	const tear = page.locator('svg.tear').first();
	await expect(tear).toBeInViewport();

	const box = (await tear.boundingBox())!;
	expect(box.y).toBeGreaterThan(8);
});
