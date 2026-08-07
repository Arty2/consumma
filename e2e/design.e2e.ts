import { readFileSync } from 'node:fs';
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

test('one handwritten face, served from our origin, and only one', async ({ page }) => {
	const families = await page.evaluate(() => [...document.fonts].map((f) => f.family));

	// Titles and body differ by size and caps, not by typeface.
	expect(families).toStrictEqual(['Graphe']);

	const used = await page.evaluate(() => [
		...new Set(
			[...document.querySelectorAll('body *')].map((el) => getComputedStyle(el).fontFamily)
		)
	]);
	for (const stack of used) {
		expect(stack, stack).toContain('Graphe');
	}
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

test('tasks are shown in caps, but stored and exported as typed', async ({ page, context }) => {
	await context.grantPermissions(['clipboard-read', 'clipboard-write']);

	await page.getByRole('button', { name: 'Add a task' }).click();
	const input = page.getByRole('textbox', { name: 'New task' });
	await input.fill('Coffee, the dark one');
	await input.press('Enter');
	await page.keyboard.press('Escape');

	const text = page.getByRole('button', { name: 'Coffee, the dark one', exact: true });
	await expect(text).toHaveCSS('text-transform', 'uppercase');
	expect(await text.innerText()).toBe('COFFEE, THE DARK ONE');

	/*
	 * The uppercase is CSS only. What is stored, what a screen reader reads and
	 * what the markdown export carries all keep the casing that was typed.
	 */
	await expect(text).toHaveAttribute('aria-label', 'Coffee, the dark one');

	await page.getByRole('button', { name: 'EXPORT', exact: true }).click();
	const exported = await page.evaluate(() => navigator.clipboard.readText());
	expect(exported).toContain('- [ ] Coffee, the dark one');
	expect(exported).not.toContain('COFFEE');
});

test('Greek loses its tonos in caps, and keeps it everywhere else', async ({ page, context }) => {
	await context.grantPermissions(['clipboard-read', 'clipboard-write']);

	await page.getByRole('button', { name: 'Add a task' }).click();
	const input = page.getByRole('textbox', { name: 'New task' });
	await input.fill('Καφές σκέτος');
	await input.press('Enter');
	// A word that goes visibly wrong without the language: ΜΑΪ́ΣΤΡΟΣ, with a
	// stranded combining acute, rather than ΜΑΪΣΤΡΟΣ.
	await input.fill('μαΐστρος');
	await input.press('Enter');
	await page.keyboard.press('Escape');

	const greek = page.getByRole('button', { name: 'Καφές σκέτος', exact: true });
	await expect(greek).toHaveAttribute('lang', 'el');
	expect(await greek.innerText()).toBe('ΚΑΦΕΣ ΣΚΕΤΟΣ');

	const dialytika = page.getByRole('button', { name: 'μαΐστρος', exact: true });
	// The dialytika stays; only the tonos goes.
	expect(await dialytika.innerText()).toBe('ΜΑΪΣΤΡΟΣ');

	// English is untouched and inherits the page language.
	await page.getByRole('button', { name: 'Add a task' }).click();
	await input.fill('Bread');
	await input.press('Enter');
	await page.keyboard.press('Escape');
	await expect(page.getByRole('button', { name: 'Bread', exact: true })).not.toHaveAttribute(
		'lang'
	);

	/*
	 * As with the uppercase, this is presentation only: the accents survive in
	 * what is stored, read aloud and exported.
	 */
	await expect(greek).toHaveAttribute('aria-label', 'Καφές σκέτος');

	await page.getByRole('button', { name: 'EXPORT', exact: true }).click();
	const exported = await page.evaluate(() => navigator.clipboard.readText());
	expect(exported).toContain('Καφές σκέτος');
	expect(exported).toContain('μαΐστρος');
});

test('the rule under a title is as wide as the title, not the row', async ({ page }) => {
	const title = page.getByRole('button', { name: 'My list' });
	const rule = page.locator('section svg.rule').first();

	const text = await title.evaluate((el) => {
		// The button fills the row for the tap target; the range measures the ink.
		const range = document.createRange();
		range.selectNodeContents(el);
		return range.getBoundingClientRect().width;
	});
	const row = (await title.boundingBox())!.width;
	const drawn = (await rule.boundingBox())!.width;

	// A pen underlines the word, not the column.
	expect(drawn).toBeLessThan(row);
	expect(drawn).toBeCloseTo(text, -1);
});

test('the credit names the version, the project and both authors', async ({ page }) => {
	const credit = page.locator('footer');

	// The version is injected from package.json, never typed out a second time.
	// Reading it here is what makes that binding load-bearing rather than a
	// comment: bump one and the other has to follow.
	const { version } = JSON.parse(readFileSync('package.json', 'utf8'));
	await expect(credit).toContainText(`v${version}`);
	await expect(credit).toContainText('heracl.es/consumma');

	const dedication = credit.getByText('Dialectic Acheropoieton', { exact: false });
	await expect(dedication).toHaveCSS('font-style', 'italic');

	// The break is three asterisks, not a rule: punctuation rather than a mark,
	// so it is the one separator here that is not drawn.
	await expect(credit.locator('.break')).toHaveText('* * *');
	expect(await credit.locator('svg').count()).toBe(0);
});

test('every underline on the sheet is drawn, not a CSS decoration', async ({ page }) => {
	const decorated = await page.evaluate(() =>
		[...document.querySelectorAll('main *')]
			.filter((el) => getComputedStyle(el).textDecorationLine.includes('underline'))
			.map((el) => el.textContent?.trim() ?? '')
	);

	expect(decorated).toStrictEqual([]);
	// The group title and the new-group row each carry a drawn rule instead.
	expect(await page.locator('main svg.rule path').count()).toBeGreaterThanOrEqual(2);
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
