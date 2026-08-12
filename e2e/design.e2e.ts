import { readFileSync } from 'node:fs';
import { expect, test, type Locator, type Page } from '@playwright/test';
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

	// The one other exception on a bare sheet: a group title's underline,
	// drawn the same way a link's is — see the next test.
	const backgrounds = await page.evaluate(() =>
		[...document.querySelectorAll('*')]
			.filter((el) => !el.classList.contains('title'))
			.map((el) => getComputedStyle(el).backgroundImage)
			.filter((value) => value !== 'none')
	);
	expect(backgrounds).toStrictEqual([]);

	// The torn edges, the boxes and the ellipsis rows are all SVG paths.
	expect(await page.locator('svg path').count()).toBeGreaterThan(2);
});

/*
 * Two exceptions, and both are worth stating as such rather than leaving the
 * rule above quietly true only because nothing on a bare sheet is a link.
 *
 * A link is inline text that wraps, and every one of its line boxes wants its
 * own underline — which is the one thing an inline <svg> measured to a box
 * cannot do. A wrapped group title needs exactly the same thing for exactly
 * the same reason, so it is drawn the same way. Both are a repeating
 * background, still drawn by the same hand, still seeded, and still nothing
 * but a stroke.
 */
test('the only backgrounds in the app are drawn underlines, on links and titles', async ({
	page
}) => {
	await page.getByRole('button', { name: 'Add a task' }).first().click();
	const field = page.getByRole('textbox', { name: 'New task' });
	await field.fill('Recipe https://heracl.es/projects/2024/consumma tonight');
	await field.press('Enter');
	await page.keyboard.press('Escape');

	const backgrounds = await page.evaluate(() =>
		[...document.querySelectorAll('*')]
			.map((el) => ({
				tag: el.tagName,
				title: el.classList.contains('title'),
				image: getComputedStyle(el).backgroundImage
			}))
			.filter((entry) => entry.image !== 'none')
	);

	// The link, and the one group title the default list starts with — each
	// an SVG drawn into the page rather than a file fetched from anywhere.
	expect(backgrounds).toHaveLength(2);
	for (const entry of backgrounds) {
		expect(entry.tag === 'A' || entry.title).toBe(true);
		expect(entry.image).toContain('data:image/svg+xml');
		expect(entry.image).toContain('stroke');
	}

	// Never the browser's own rule. The check below walks the whole page for
	// that; this says it of the two elements most likely to acquire one.
	await expect(page.locator('a').first()).toHaveCSS('text-decoration-line', 'none');
	await expect(page.locator('.title').first()).toHaveCSS('text-decoration-line', 'none');
});

test('the link underline is ink, and turns over with the theme', async ({ page }) => {
	await page.emulateMedia({ colorScheme: 'light' });
	await page.getByRole('button', { name: 'Add a task' }).first().click();
	const field = page.getByRole('textbox', { name: 'New task' });
	await field.fill('Recipe https://heracl.es/consumma tonight');
	await field.press('Enter');
	await page.keyboard.press('Escape');

	const tile = () =>
		page
			.locator('a')
			.first()
			.evaluate((el) => getComputedStyle(el).backgroundImage);

	// A data URI is its own document and cannot read --ink, so the colour is
	// baked and the pair is swapped with the theme. Black on the white sheet.
	expect(decodeURIComponent(await tile())).toContain('stroke="#000"');

	await themeButton(page).click();
	await expect.poll(async () => (await swatch(page)).resolved).toBe('dark');
	expect(decodeURIComponent(await tile())).toContain('stroke="#fff"');
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

	for (const label of ['Import', 'Export', 'Leave', 'Clear']) {
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

test('the underline under a title is as wide as the title, not the row', async ({ page }) => {
	const title = page.getByRole('button', { name: 'My list' });

	const image = await title.evaluate((el) => getComputedStyle(el).backgroundImage);
	expect(image).toContain('data:image/svg+xml');

	const text = await title.evaluate((el) => {
		const range = document.createRange();
		range.selectNodeContents(el);
		return range.getBoundingClientRect().width;
	});
	/*
	 * The button's own box is what the underline paints against — display:
	 * inline, so its width is its content's width, not the row's. Measured
	 * against the header rather than the button, since the button is only as
	 * wide as the name, so that the collapse icon can sit against it and the
	 * total can take the end of the row. The claim is unchanged — a pen
	 * underlines the word, not the column.
	 */
	const row = (await page.locator('section .header').first().boundingBox())!.width;
	const drawn = (await title.boundingBox())!.width;

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

test('the empty box shows on a bare sheet, and is kept back once there is a list', async ({
	page
}) => {
	const box = page.locator('.tasks li .box path');

	/*
	 * Read as a number, not as the string it was written as: the build minifies
	 * the stylesheet, so the custom property comes back as `.45` where a
	 * computed opacity is always `0.45`.
	 */
	const faint = Number(
		await page.evaluate(() =>
			getComputedStyle(document.documentElement).getPropertyValue('--faint')
		)
	);
	const opacity = (locator: Locator) =>
		locator.evaluate((el) => Number(getComputedStyle(el).opacity));

	/*
	 * Nothing written yet, so this is the only row on the sheet. There is no
	 * list for it to sit at the end of and be counted as part of, and it is the
	 * one thing here saying what a task on this sheet looks like.
	 */
	await expect(box).toHaveCount(1);
	expect(await opacity(box)).toBeCloseTo(faint, 5);

	// As faint as the ellipsis beside it: the two are one mark.
	expect(await opacity(page.locator('.tasks li button.text'))).toBeCloseTo(faint, 5);

	await page.getByRole('button', { name: 'Add a task' }).click();
	const input = page.getByRole('textbox', { name: 'New task' });
	await input.fill('Bread');
	await input.press('Enter');
	await page.keyboard.press('Escape');

	/*
	 * Now there is a list, and an empty square at the end of one reads as one
	 * more thing to do rather than as room for one.
	 */
	expect(await opacity(page.locator('.tasks li').last().locator('.box path'))).toBe(0);
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

	/*
	 * The measurement below reads a real line box off the page and compares it
	 * with canvas metrics for the same face, so the two have to be talking
	 * about the same font: measured mid-swap they disagree by enough to spend
	 * the whole budget this assertion has, which is 0.58px — the offset lands
	 * at -0.42 and the bar is 1. That is what made this fail once in a full
	 * parallel run and never once on its own.
	 */
	await page.evaluate(() => document.fonts.ready);

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

	/*
	 * The break above it is the same tear the panel's other sections are told
	 * apart by. It used to be three asterisks — punctuation rather than a mark,
	 * and the one separator here that was not drawn, which left the panel with
	 * two ways of saying the same thing.
	 */
	const tear = credit.locator('svg path');
	await expect(tear).toHaveCount(1);

	// Dashed from the shared class rather than an attribute of its own, which
	// is what makes it the same mark and not merely a similar one.
	await expect(tear).toHaveClass(/drawn--dashed/);
	expect(await tear.evaluate((el) => getComputedStyle(el).strokeDasharray)).not.toBe('none');
});

test('the menu is told apart by tears, and they are the same mark as Loose ends', async ({
	page
}) => {
	await openMenu(page);

	// One before each of the two headings, one above the debug toggle
	// (which has no heading of its own), and one above the credit.
	const tears = page.getByRole('dialog', { name: 'Menu' }).locator('.tear svg path');
	await expect(tears).toHaveCount(4);

	// Drawn and dashed, at the weight everything else here is drawn at.
	for (const dash of await tears.evaluateAll((paths) =>
		paths.map((p) => getComputedStyle(p).strokeDasharray)
	)) {
		expect(dash).not.toBe('none');
	}

	// Full width, out to the drawn frame of the drawer — a break that stopped
	// short of both margins would be a rule, and a rule is a different mark.
	const panel = (await page.getByRole('dialog', { name: 'Menu' }).boundingBox())!;
	const first = (await tears.first().boundingBox())!;
	expect(first.width).toBeGreaterThan(panel.width * 0.85);
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
	// The new-group row carries a drawn rule; the group title carries a
	// drawn underline instead, the same mechanism as a link's.
	expect(await page.locator('main svg.rule path').count()).toBeGreaterThanOrEqual(1);
	expect(
		await page
			.locator('main .title')
			.first()
			.evaluate((el) => getComputedStyle(el).backgroundImage)
	).not.toBe('none');

	await openMenu(page);
	expect(await underlined(page)).toStrictEqual([]);
	// Its two section headers are ruled the way a group title is, plus the
	// menu's own always-shown copy of the list switcher's pill.
	expect(await page.locator('[role="dialog"] svg.rule path').count()).toBe(3);
});

test('every button in the menu is boxed, and no two boxes are alike', async ({ page }) => {
	await openMenu(page);

	const menu = page.locator('[role="dialog"]');
	// Every button that does something, which is all of them but the ✕ and
	// the switcher pill — a disclosure toggle like the burger it stands
	// beside on the sheet, drawn without a box there too.
	const labelled = menu.locator('button:not(.close):not(.pill)');
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

/*
 * The theme. Two colours still, with the paper and the ink changing places —
 * everything above holds in dark, and the greyscale test in particular is what
 * says the inversion did not introduce a colour on the way.
 */

function themeButton(page: Page) {
	return page.getByRole('button', { name: /^Theme/ });
}

const swatch = (page: Page) =>
	page.evaluate(() => {
		const style = getComputedStyle(document.documentElement);
		return {
			resolved: document.documentElement.dataset.theme,
			ink: style.getPropertyValue('--ink').trim(),
			paper: style.getPropertyValue('--paper').trim(),
			background: style.backgroundColor,
			tint: document.querySelector('meta[name="theme-color"]')?.getAttribute('content')
		};
	});

test('the sheet follows the phone until somebody says otherwise', async ({ page }) => {
	// The default, and it writes nothing down: arriving is not a choice.
	await expect(themeButton(page)).toHaveAttribute('aria-label', 'Theme — following the phone');
	expect(await page.evaluate(() => localStorage.getItem('consumma:theme'))).toBeNull();

	/*
	 * The phone changing its mind at dusk turns the sheet with it. Polled
	 * rather than read straight back: the change arrives as a media query
	 * event, so it lands a tick after the emulation is set.
	 */
	await page.emulateMedia({ colorScheme: 'dark' });
	await expect.poll(async () => (await swatch(page)).resolved).toBe('dark');

	await page.emulateMedia({ colorScheme: 'light' });
	await expect.poll(async () => (await swatch(page)).resolved).toBe('light');
});

test('the first tap is always the opposite of the phone, so something changes', async ({
	page
}) => {
	await page.emulateMedia({ colorScheme: 'light' });
	await themeButton(page).click();
	await expect(themeButton(page)).toHaveAttribute('aria-label', 'Theme — dark');
	expect((await swatch(page)).resolved).toBe('dark');

	// Round in two, and back to writing nothing down. There is no third state:
	// the choice agreeing with the phone drew the same sheet as following it,
	// so both the tap into it and the tap out of it looked like nothing.
	await themeButton(page).click();
	await expect(themeButton(page)).toHaveAttribute('aria-label', 'Theme — following the phone');
	expect((await swatch(page)).resolved).toBe('light');
	expect(await page.evaluate(() => localStorage.getItem('consumma:theme'))).toBeNull();

	// And the other way on a dark phone.
	await page.emulateMedia({ colorScheme: 'dark' });
	await themeButton(page).click();
	await expect(themeButton(page)).toHaveAttribute('aria-label', 'Theme — light');
});

test('dark is the two colours changing places, and no third one', async ({ page }) => {
	const light = await swatch(page);
	expect(light).toMatchObject({ ink: '#000', paper: '#fff', tint: '#ffffff' });

	await themeButton(page).click();
	const dark = await swatch(page);
	expect(dark).toMatchObject({ ink: '#fff', paper: '#000', tint: '#000000' });
	expect(dark.background).not.toBe(light.background);

	await page.getByRole('button', { name: 'Add a task' }).click();
	const input = page.getByRole('textbox', { name: 'New task' });
	await input.fill('Bread');
	await input.press('Enter');
	await page.keyboard.press('Escape');

	// The same rule as in light: a grey would be a channel disagreeing.
	const colours = await page.evaluate(() => {
		const seen = new Set<string>();
		for (const el of document.querySelectorAll('*')) {
			const style = getComputedStyle(el);
			for (const value of [style.color, style.backgroundColor, style.borderTopColor]) {
				if (value === 'rgba(0, 0, 0, 0)' || value === 'transparent') continue;
				seen.add(value);
			}
		}
		return [...seen];
	});

	for (const colour of colours) {
		const [r, g, b] = colour.match(/\d+/g)!.slice(0, 3).map(Number);
		expect(r).toBe(g);
		expect(g).toBe(b);
	}
});

test('a sheet that is going to be black is never white first', async ({ page }) => {
	await page.evaluate(() => localStorage.setItem('consumma:theme', 'dark'));

	/*
	 * With the app's own modules refused outright, so nothing that could set
	 * this has run except the classic script in the head. If the theme arrived
	 * with hydration instead, the sheet would be white here — and white for
	 * that long on every open, which on two colours is the whole screen.
	 */
	// The scripts only — the stylesheet is what the attribute then selects on.
	await page.route('**/_app/**/*.js', (route) => route.abort());
	await page.goto('/', { waitUntil: 'domcontentloaded' });

	expect(await page.evaluate(() => document.documentElement.dataset.theme)).toBe('dark');
	expect(
		await page.evaluate(() => getComputedStyle(document.documentElement).backgroundColor)
	).toBe('rgb(0, 0, 0)');
});

test('and it does not turn white again once the app has loaded', async ({ page }) => {
	/*
	 * The other half of the same flash. The script settles the theme before the
	 * paint, and then the app hydrates on top of it — so an effect that applies
	 * the default before the stored choice has been read puts a white frame on
	 * screen after the sheet is already up, which is worse than the one before.
	 *
	 * Every value the attribute takes, from the first script to well past
	 * hydration. There should be exactly one of them.
	 */
	await page.emulateMedia({ colorScheme: 'light' });
	await page.evaluate(() => localStorage.setItem('consumma:theme', 'dark'));

	await page.addInitScript(() => {
		const seen: string[] = [];
		Object.defineProperty(window, 'seenThemes', { get: () => seen });

		const record = () => {
			const value = document.documentElement?.dataset.theme;
			if (value) seen.push(value);
		};

		/*
		 * Watches the document rather than its element: this runs before the
		 * page is parsed, when there is no documentElement yet to observe, and
		 * an observer that throws here leaves the test seeing nothing at all
		 * and calling it a pass.
		 */
		new MutationObserver(record).observe(document, {
			attributes: true,
			subtree: true,
			attributeFilter: ['data-theme']
		});
		document.addEventListener('DOMContentLoaded', record);
	});

	await page.reload();
	await expect(page.getByRole('button', { name: 'Add a task' })).toBeVisible();

	const seen = await page.evaluate(
		() => (window as unknown as { seenThemes: string[] }).seenThemes
	);
	// Something has to have been recorded, or this passes by having seen nothing.
	expect(seen.length).toBeGreaterThan(0);
	expect(new Set(seen)).toStrictEqual(new Set(['dark']));
});

test('the theme is the device’s, so removing the list does not take it', async ({ page }) => {
	await themeButton(page).click();
	await expect(themeButton(page)).toHaveAttribute('aria-label', 'Theme — dark');

	await fromMenu(page, 'Leave');
	await page.getByRole('button', { name: 'Leave', exact: true }).click();

	await page.reload();
	await expect(themeButton(page)).toHaveAttribute('aria-label', 'Theme — dark');
	expect((await swatch(page)).resolved).toBe('dark');
});

/*
 * At the top, under the corner buttons.
 *
 * A phone puts its keyboard at the bottom of the screen, and every toast here
 * follows an edit — which is made with the keyboard up. Down there the one
 * message most worth reading, the one offering to undo what just happened, was
 * behind the keys that had just caused it.
 */
test('the toast stands at the top, clear of where a keyboard comes up', async ({ page }) => {
	await page.setViewportSize({ width: 390, height: 760 });

	await page.getByRole('button', { name: 'Add a task' }).click();
	const input = page.getByRole('textbox', { name: 'New task' });
	await input.fill('Bread');
	await input.press('Enter');
	await page.keyboard.press('Escape');

	await page.getByRole('checkbox', { name: 'Bread' }).click();
	await page.getByRole('button', { name: 'Delete task' }).first().click();
	// The row pops before it actually goes, so the undo toast lands a beat
	// after the click rather than in the same tick.
	await page.locator('.toast').waitFor();

	const where = await page.evaluate(() => {
		const toast = document.querySelector('.toast')!.getBoundingClientRect();
		const burger = document.querySelector('[aria-label^="Menu"]')!.getBoundingClientRect();
		return {
			top: toast.top,
			bottom: toast.bottom,
			left: toast.left,
			right: toast.right,
			cornerTop: burger.top,
			cornerBottom: burger.bottom,
			cornerRight: burger.right,
			height: innerHeight
		};
	});

	// On the buttons' own line, standing where they stand rather than a row
	// below them — and covering them outright while it shows, which is why it
	// has to reach at least as far as the burger does at either end.
	expect(where.top).toBeCloseTo(where.cornerTop, 0);
	expect(where.bottom).toBeGreaterThanOrEqual(where.cornerBottom);
	expect(where.right).toBeGreaterThanOrEqual(where.cornerRight);

	// And nowhere near the bottom, which is the keyboard's half of the screen.
	expect(where.bottom).toBeLessThan(where.height / 2);
});

test('the receipt is never shorter than the screen, and grows past it with the list', async ({
	page
}) => {
	/*
	 * A list of three lines used to leave a strip of paper a few centimetres
	 * tall at the top of an empty screen, which is a note pinned to a wall
	 * rather than a receipt. It also gave away that the sheet and the menu are
	 * two elements: the panel is `top: 0; bottom: 0` and always was, so the turn
	 * swapped a small paper for a screen-tall one.
	 */
	const viewport = page.viewportSize()!;

	// The whole receipt: the top tear down to the bottom one, tears included.
	const receipt = () =>
		page.evaluate(() => {
			const tears = [...document.querySelectorAll('.page > .tear, .page > .top > .tear')];
			const page_ = document.querySelector('.page')!.getBoundingClientRect();
			return { height: page_.height, tears: tears.length };
		});

	const bare = await receipt();
	// Both tears are on the page, so this is the paper end to end.
	expect(bare.tears).toBe(2);

	// Filling the screen, give or take the stroke the tears hang outside their
	// boxes by.
	expect(bare.height).toBeGreaterThanOrEqual(viewport.height - 2);
	expect(bare.height).toBeLessThanOrEqual(viewport.height + 2);

	// The page itself does not scroll while the list is short enough to fit.
	const scrolls = await page.evaluate(
		() => document.documentElement.scrollHeight > document.documentElement.clientHeight + 1
	);
	expect(scrolls).toBe(false);

	// Enough rows to run off the bottom, and the floor stops being what decides.
	for (let i = 0; i < 24; i++) {
		await page.keyboard.press('Escape');
		await page.getByRole('button', { name: 'Add a task' }).first().click();
		const input = page.getByRole('textbox', { name: 'New task' });
		await input.fill(`Item ${i}`);
		await input.press('Enter');
	}
	await page.keyboard.press('Escape');

	const full = await receipt();
	expect(full.height).toBeGreaterThan(viewport.height);
});

test('the paper is torn, not drawn torn: nothing fills the notches', async ({ page }) => {
	/*
	 * A zigzag is only a line. Left to fill its own box, whatever is behind it
	 * paints paper on both sides of the teeth and the tear cuts nothing — it
	 * reads as a mark drawn on a rectangle rather than as the edge of a sheet.
	 *
	 * Two halves to that. Each tear carries its own ground, closed along its
	 * inner edge, so the paper comes up to the zigzag and stops. And the panel's
	 * own ground is clipped to its content box, which `padding-block` puts at
	 * exactly the inner edge of the two tears.
	 */
	const paper = await page.evaluate(() => getComputedStyle(document.body).backgroundColor);

	for (const root of ['.page', '[role="dialog"]']) {
		if (root !== '.page') await openMenu(page);

		const grounds = page.locator(`${root} svg.tear path.ground`);
		await expect(grounds).toHaveCount(2);

		for (const fill of await grounds.evaluateAll((paths) =>
			paths.map((p) => getComputedStyle(p).fill)
		)) {
			expect(fill).toBe(paper);
		}

		// Filled and never stroked: it is the paper, not a mark.
		for (const stroke of await grounds.evaluateAll((paths) =>
			paths.map((p) => getComputedStyle(p).stroke)
		)) {
			expect(stroke).toBe('none');
		}
	}

	// And the panel stops at the tears rather than filling the box behind them.
	expect(
		await page
			.getByRole('dialog', { name: 'Menu' })
			.evaluate((el) => getComputedStyle(el).backgroundClip)
	).toBe('content-box');
});
