import { readFileSync } from 'node:fs';
import { expect, test, type Page } from '@playwright/test';
import { fromMenu, openMenu } from './menu';

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

	// Titles and body differ by size and caps, not by typeface. This is the
	// assertion that guards against a second downloaded face, and it holds
	// whatever the carve-out below allows: the figures are a system stack, so
	// there is still one @font-face, one file and no extra request.
	expect(families).toStrictEqual(['Graphe']);

	/*
	 * The one exception, and it is named rather than inferred: a recognised
	 * count or price carries `.num` and is set in the mono stack, because a
	 * figure is not a word and the prices have to line down a column. Anything
	 * else resolving to something other than Graphe is a second face creeping
	 * back in.
	 */
	const used = await page.evaluate(() =>
		[...document.querySelectorAll('body *')].map((el) => ({
			figure: el.classList.contains('num'),
			stack: getComputedStyle(el).fontFamily
		}))
	);
	for (const { figure, stack } of used) {
		if (figure) expect(stack, stack).toContain('ui-monospace');
		else expect(stack, stack).toContain('Graphe');
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

	// And the menu, which is where every action lives now, fits too.
	await openMenu(page);
	expect(
		await page.evaluate(
			() => document.documentElement.scrollWidth > document.documentElement.clientWidth
		)
	).toBe(false);

	for (const label of ['Import', 'Export', 'Delete', 'Clear']) {
		const box = await page
			.getByRole('dialog', { name: 'Menu' })
			.getByRole('button', { name: label })
			.boundingBox();
		expect(box!.height, label).toBeLessThan(70);
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

	await fromMenu(page, 'Export');
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

	await fromMenu(page, 'Export');
	const exported = await page.evaluate(() => navigator.clipboard.readText());
	expect(exported).toContain('Καφές σκέτος');
	expect(exported).toContain('μαΐστρος');
});

test('the rule under a title is as wide as the title, not the row', async ({ page }) => {
	const title = page.getByRole('button', { name: 'My list' });
	const rule = page.locator('section svg.rule').first();

	const text = await title.evaluate((el) => {
		const range = document.createRange();
		range.selectNodeContents(el);
		return range.getBoundingClientRect().width;
	});
	/*
	 * Measured against the header rather than the title button: the button is
	 * only as wide as the name now, so that the collapse icon can sit against it
	 * and the total can take the end of the row. The claim is unchanged — a pen
	 * underlines the word, not the column.
	 */
	const row = (await page.locator('section .header').first().boundingBox())!.width;
	const drawn = (await rule.boundingBox())!.width;

	// A pen underlines the word, not the column.
	expect(drawn).toBeLessThan(row);
	expect(drawn).toBeCloseTo(text, -1);
});

test('the menu\u2019s headers are ruled as wide as they are, at any width', async ({ page }) => {
	/*
	 * The hidden copy TextRule measures needs the whole row to lay itself out
	 * in. Centring it on `left: 50%` left it half of one, so "Join another
	 * list" wrapped where the visible header did not and its rule came out
	 * 132px under 224px of words. Only the rule is centred now.
	 */
	for (const width of [320, 390]) {
		await page.setViewportSize({ width, height: 900 });
		await openMenu(page);

		const rows = await page.evaluate(() =>
			[...document.querySelectorAll('[role="dialog"] h2')].map((h) => {
				const range = document.createRange();
				range.selectNodeContents(h);
				const text = range.getBoundingClientRect();
				const rule = h.nextElementSibling!.querySelector('svg.rule')!.getBoundingClientRect();
				return {
					label: h.textContent!.trim(),
					text: text.width,
					rule: rule.width,
					offset: (rule.left + rule.right) / 2 - (text.left + text.right) / 2
				};
			})
		);

		expect(rows).toHaveLength(2);
		for (const row of rows) {
			expect(row.rule, `${row.label} at ${width}`).toBeCloseTo(row.text, -1);
			// And it sits under the words rather than off to one side.
			expect(Math.abs(row.offset), `${row.label} at ${width}`).toBeLessThan(2);
		}

		await page.keyboard.press('Escape');
	}
});

test('the toast is a bar, inset from the paper on both sides', async ({ page }) => {
	await page.getByRole('button', { name: 'Add a task' }).click();
	const input = page.getByRole('textbox', { name: 'New task' });
	await input.fill('Bread');
	await input.press('Enter');
	await page.keyboard.press('Escape');

	// Only a done task offers a way out.
	await page.getByRole('checkbox', { name: 'Bread' }).click();
	await page.getByRole('button', { name: 'Delete task' }).first().click();
	await expect(page.locator('.toast')).toBeVisible();

	for (const width of [320, 390]) {
		await page.setViewportSize({ width, height: 760 });

		const edges = await page.evaluate(() => {
			const toast = document.querySelector('.toast')!.getBoundingClientRect();
			const paper = document.querySelector('main')!.getBoundingClientRect();
			return { tl: toast.left, tr: toast.right, pl: paper.left, pr: paper.right };
		});

		// Inside the paper's edges, so it reads as sitting in front of the sheet
		// rather than as another part of it — and centred on the same middle.
		expect(edges.tl, `left at ${width}`).toBeGreaterThan(edges.pl);
		expect(edges.tr, `right at ${width}`).toBeLessThan(edges.pr);
		expect((edges.tl + edges.tr) / 2, `centre at ${width}`).toBeCloseTo(
			(edges.pl + edges.pr) / 2,
			1
		);

		// Still a bar rather than a label shrunk to its words.
		expect(edges.tr - edges.tl, `width at ${width}`).toBeGreaterThan(200);
	}
});

test('one ellipsis, set one way, wherever it stands for something not there yet', async ({
	page
}) => {
	/*
	 * The add-task row and the new-group row say the same thing with the same
	 * glyph. They were set at different sizes, and the new-group one was full
	 * black over a rule drawn faint — one mark in two minds.
	 */
	const style = (selector: string) =>
		page.locator(selector).evaluate((el) => {
			const s = getComputedStyle(el);
			return { size: s.fontSize, opacity: s.opacity };
		});

	const addTask = await style('.tasks li button.text');
	const newGroup = await style('.new-group button');

	expect(addTask).toStrictEqual(newGroup);

	// And as faint as the rule that belongs to it.
	const rule = await page
		.locator('.new-group svg.rule path')
		.evaluate((el) => getComputedStyle(el).opacity);
	expect(newGroup.opacity).toBe(rule);

	/*
	 * The third one: a group whose name has been taken away. A title cannot be
	 * created empty, so this is the only route to it — and it is the same
	 * absence as the other two, not a different kind.
	 */
	const title = page.getByRole('button', { name: 'My list' });
	await title.dblclick();
	const field = page.getByRole('textbox', { name: 'Group title' });
	await field.fill('');
	await field.press('Enter');

	await expect(page.getByRole('button', { name: 'Untitled group' })).toHaveText('…');
	expect(await style('.title.untitled')).toStrictEqual(addTask);
});

test('a group title has the air under it that the tasks have between them', async ({ page }) => {
	await page.getByRole('button', { name: 'Add a task' }).click();
	const input = page.getByRole('textbox', { name: 'New task' });
	for (const text of ['Bread', 'Coffee', 'Milk']) {
		await input.fill(text);
		await input.press('Enter');
	}
	await page.keyboard.press('Escape');

	const gaps = await page.evaluate(() => {
		const ctx = document.createElement('canvas').getContext('2d')!;

		// Where the capitals actually start and stop, not where their line box does.
		const ink = (el: Element) => {
			const s = getComputedStyle(el);
			const range = document.createRange();
			range.selectNodeContents(el);
			const line = range.getBoundingClientRect();
			ctx.font = `${s.fontSize} ${s.fontFamily}`;
			const m = ctx.measureText(el.textContent!.trim().toUpperCase());
			const fh = m.fontBoundingBoxAscent + m.fontBoundingBoxDescent;
			const base = line.top + (line.height - fh) / 2 + m.fontBoundingBoxAscent;
			return { top: base - m.actualBoundingBoxAscent, bottom: base + m.actualBoundingBoxDescent };
		};

		const tasks = [...document.querySelectorAll('.tasks li button.text')].filter(
			(t) => t.textContent!.trim() !== '…'
		);
		const between = [];
		for (let i = 1; i < tasks.length; i++) {
			between.push(ink(tasks[i]).top - ink(tasks[i - 1]).bottom);
		}

		const rule = document.querySelector('section svg.rule')!.getBoundingClientRect();
		return { between, underTitle: ink(tasks[0]).top - rule.bottom };
	});

	expect(gaps.between.length).toBeGreaterThan(0);
	const rhythm = gaps.between.reduce((a, b) => a + b, 0) / gaps.between.length;

	// Within a couple of pixels: which capitals are on the row moves it a little.
	expect(Math.abs(gaps.underTitle - rhythm)).toBeLessThan(3);
});

test('the toast reads on the middle of its own box', async ({ page }) => {
	await page.getByRole('button', { name: 'Add a task' }).click();
	const input = page.getByRole('textbox', { name: 'New task' });
	await input.fill('Bread');
	await input.press('Enter');
	await page.keyboard.press('Escape');

	await page.getByRole('checkbox', { name: 'Bread' }).click();
	await page.getByRole('button', { name: 'Delete task' }).first().click();
	await expect(page.locator('.toast')).toBeVisible();

	const offset = await page.evaluate(() => {
		const toast = document.querySelector('.toast')!;
		const words = toast.querySelector('span')!;
		const drawn = toast.querySelector('svg.rect path')!.getBoundingClientRect();

		const style = getComputedStyle(words);
		const range = document.createRange();
		range.selectNodeContents(words);
		const line = range.getBoundingClientRect();

		const ctx = document.createElement('canvas').getContext('2d')!;
		ctx.font = `${style.fontSize} ${style.fontFamily}`;
		const m = ctx.measureText(words.textContent!.trim().toUpperCase());
		const fh = m.fontBoundingBoxAscent + m.fontBoundingBoxDescent;
		const base = line.top + (line.height - fh) / 2 + m.fontBoundingBoxAscent;
		const ink = (base - m.actualBoundingBoxAscent + (base + m.actualBoundingBoxDescent)) / 2;

		return (drawn.top + drawn.bottom) / 2 - ink;
	});

	// Graphe's capitals ride high, so a box centred on the row reads low.
	expect(Math.abs(offset)).toBeLessThan(2);
});

test('a checkbox sits level with the capitals it is beside', async ({ page }) => {
	/*
	 * What `--cap-lift` is for. Graphe's capitals ride high in their own line
	 * box, so a checkbox centred on the row reads low against them — by about
	 * four pixels, which is plainly visible on a 19px line.
	 *
	 * This guards the lift itself, not where the font-size is declared: moving
	 * the size between the row and the text moves the box by a quarter of a
	 * pixel, and no assertion should pretend to see that.
	 */
	await page.getByRole('button', { name: 'Add a task' }).click();
	const input = page.getByRole('textbox', { name: 'New task' });
	await input.fill('Bread');
	await input.press('Enter');
	await page.keyboard.press('Escape');
	await page.mouse.move(0, 0);

	const offset = await page.evaluate(() => {
		const row = document.querySelector('.tasks li')!;
		const text = row.querySelector('.text')!;
		const box = row.querySelector('svg path')!.getBoundingClientRect();

		const style = getComputedStyle(text);
		const range = document.createRange();
		range.selectNodeContents(text);
		const line = range.getBoundingClientRect();

		const ctx = document.createElement('canvas').getContext('2d')!;
		ctx.font = `${style.fontSize} ${style.fontFamily}`;
		const m = ctx.measureText(text.textContent!.trim().toUpperCase());
		const fh = m.fontBoundingBoxAscent + m.fontBoundingBoxDescent;
		const base = line.top + (line.height - fh) / 2 + m.fontBoundingBoxAscent;

		const inkMiddle = (base - m.actualBoundingBoxAscent + (base + m.actualBoundingBoxDescent)) / 2;
		return (box.top + box.bottom) / 2 - inkMiddle;
	});

	// Within a pixel of the middle of the letters. Without the lift it is four.
	expect(Math.abs(offset)).toBeLessThan(1);
});

test('the credit names the version, the project and both authors', async ({ page }) => {
	// It sits at the foot of the menu now, not on the sheet.
	await expect(page.locator('footer')).toHaveCount(0);
	await openMenu(page);

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

test('every underline in the app is drawn, not a CSS decoration', async ({ page }) => {
	/*
	 * The sheet has always been held to this. The menu was not, and quietly kept
	 * eleven CSS underlines on its buttons — so the rule is checked over the
	 * whole document now, with the menu open, and covers both.
	 */
	const underlined = (page: Page) =>
		page.evaluate(() =>
			[...document.querySelectorAll('body *')]
				.filter((el) => getComputedStyle(el).textDecorationLine.includes('underline'))
				.map((el) => el.textContent?.trim().slice(0, 40) ?? '')
		);

	expect(await underlined(page)).toStrictEqual([]);
	// The group title and the new-group row each carry a drawn rule instead.
	expect(await page.locator('main svg.rule path').count()).toBeGreaterThanOrEqual(2);

	await openMenu(page);
	expect(await underlined(page)).toStrictEqual([]);
	// And its two section headers are ruled the way a group title is.
	expect(await page.locator('[role="dialog"] svg.rule path').count()).toBe(2);
});

test('every button in the menu is boxed, and no two boxes are alike', async ({ page }) => {
	await openMenu(page);

	const menu = page.locator('[role="dialog"]');
	// Every button that does something, which is all of them but the ✕.
	const labelled = menu.locator('button:not(.close)');
	const count = await labelled.count();
	expect(count).toBeGreaterThanOrEqual(6);

	for (let i = 0; i < count; i++) {
		await expect(labelled.nth(i).locator('svg.rect path')).toHaveCount(1);
	}

	/*
	 * Eleven copies of one rectangle would read as a stamp. Each box is seeded
	 * from its own name, so the strokes differ — that is the whole reason the
	 * seeds are not an index.
	 */
	const shapes = await labelled
		.locator('svg.rect path')
		.evaluateAll((paths) => paths.map((p) => p.getAttribute('d')));
	expect(new Set(shapes).size).toBe(shapes.length);
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
