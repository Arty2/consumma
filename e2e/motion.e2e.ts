import { expect, test, type Page } from '@playwright/test';
import { menuButton, settle } from './menu';

/*
 * Reduced motion, which until now nothing checked.
 *
 * Every animation in this app asks the question in JavaScript rather than
 * leaving it to the media query, because several of them are cleared by their
 * own `animationend` — and an animation that is merely shortened to nothing
 * still ends, but one that was never started does not. The menu is the sharpest
 * case: the panel is taken away by the end of its own turn, so a turn switched
 * off in CSS alone would leave it standing over the sheet for good, with the
 * focus trap still armed and no way past it.
 *
 * These tests are that failure, written down.
 */

const dialog = { name: 'Menu' } as const;

/*
 * Asked of the page rather than through `test.use({ reducedMotion })`, which
 * this version takes without complaint and does not apply — `matchMedia` in the
 * page went on answering false, and the tests passed against an app that was
 * still animating. And asked before the first navigation, because the panel
 * reads the preference as it is created rather than as it draws.
 */
async function still(page: Page) {
	await page.emulateMedia({ reducedMotion: 'reduce' });
	await page.goto('/');
	expect(await page.evaluate(() => matchMedia('(prefers-reduced-motion: reduce)').matches)).toBe(
		true
	);
}

/*
 * How far something is turned, in degrees. Nought is face up.
 *
 * `.page` is the sheet and the dialog is the panel — the two sides of the one
 * piece of paper, read the same way.
 */
function turned(el: Element) {
	const m = new DOMMatrix(getComputedStyle(el).transform);
	// `|| 0` so a rotation of none reads as 0 rather than as -0.
	return Math.round((Math.atan2(-m.m13, m.m11) * 180) / Math.PI) || 0;
}

function angle(page: Page) {
	return page.locator('.page').evaluate(turned);
}

function panelAngle(page: Page) {
	return page.getByRole('dialog', dialog).evaluate(turned);
}

test.describe('with motion reduced', () => {
	test('the menu arrives whole, without waiting out a turn it is not making', async ({ page }) => {
		await still(page);
		await menuButton(page).click();

		/*
		 * At once, and at full width. The panel unfurls out of the sheet's own
		 * hinge half a turn after the tap, and that wait is an animation delay
		 * rather than a duration — the reduced-motion backstop in app.css
		 * shortens durations and says nothing about delays, so a panel left to
		 * it alone would hang edge-on and unreadable for exactly as long as the
		 * animation it is not playing.
		 */
		const panel = page.getByRole('dialog', dialog);
		await expect(panel).toBeVisible();

		const box = (await panel.boundingBox())!;
		const viewport = page.viewportSize()!;
		// `--paper-width` is 34rem; narrower viewports get all of themselves.
		expect(box.width).toBeGreaterThan(Math.min(viewport.width, 544) - 2);

		// Nothing is moving, on the panel or on the paper behind it.
		expect(await page.evaluate(() => document.getAnimations().length)).toBe(0);
	});

	test('the menu goes away again, rather than waiting for an end that never comes', async ({
		page
	}) => {
		await still(page);
		await menuButton(page).click();
		await expect(page.getByRole('dialog', dialog)).toBeVisible();

		await page.getByRole('button', { name: 'Close' }).click();

		/*
		 * Gone, and the burger back. If the panel were waiting on an
		 * `animationend` this is where it would sit for ever.
		 */
		await expect(page.getByRole('dialog', dialog)).toBeHidden();
		await expect(menuButton(page)).toBeVisible();

		// And the paper never turned, rather than being left face-down.
		expect(await angle(page)).toBe(0);
	});

	test('Escape closes it too, and gives the sheet back its scrolling', async ({ page }) => {
		await still(page);
		await menuButton(page).click();
		await expect(page.getByRole('dialog', dialog)).toBeVisible();

		await page.keyboard.press('Escape');
		await expect(page.getByRole('dialog', dialog)).toBeHidden();

		expect(await page.evaluate(() => document.body.style.overflow)).not.toBe('hidden');
	});
});

test.describe('with motion as it comes', () => {
	test('the paper turns over, and turns back', async ({ page }) => {
		await page.goto('/');

		// Face up to begin with: nothing is turned until something asks for it.
		expect(await angle(page)).toBe(0);

		await menuButton(page).click();
		await expect(page.getByRole('dialog', dialog)).toBeVisible();
		await settle(page);

		/*
		 * Face down once the menu is up, and held there. The panel goes on
		 * unfurling through the second half of the turn, so a sheet that stood
		 * upright at the end of its own animation would do it in full view.
		 */
		expect(await angle(page)).toBe(-90);

		await page.getByRole('button', { name: 'Close' }).click();
		await expect(page.getByRole('dialog', dialog)).toBeHidden();
		await settle(page);

		// And back up, the right way round again.
		expect(await angle(page)).toBe(0);
	});

	test('the two halves are one turn: neither is ever seen beside the other', async ({ page }) => {
		await page.goto('/');
		await menuButton(page).click();

		/*
		 * The sheet folds into the hinge and the panel comes back out of it, and
		 * the handover happens at the one moment both are edge-on. Sampled
		 * across the whole turn, no frame ever has two pieces of paper with
		 * width in them — which is what would give away that there are two.
		 */
		const frames: Array<[number, number]> = [];
		for (let i = 0; i < 24; i++) {
			frames.push(
				await page.evaluate(() => {
					const width = (selector: string) => {
						const el = document.querySelector(selector);
						return el ? el.getBoundingClientRect().width : 0;
					};
					return [width('.page'), width('[role="dialog"]')] as [number, number];
				})
			);
			await page.waitForTimeout(20);
		}

		// A couple of pixels of stroke either side of the join is not two sheets.
		for (const [sheet, panel] of frames) {
			expect(Math.min(sheet, panel)).toBeLessThan(4);
		}

		// And the turn did actually happen — both were wide at some point.
		expect(Math.max(...frames.map(([sheet]) => sheet))).toBeGreaterThan(300);
		expect(Math.max(...frames.map(([, panel]) => panel))).toBeGreaterThan(300);
	});
});

test.describe('turning it over by hand', () => {
	/**
	 * Where the axis sits, as a percentage across the paper.
	 *
	 * Against `offsetWidth`, which is what the paper is laid out at, and not
	 * the bounding box, which is what is left of it once it has been turned —
	 * edge-on that is nought, and the percentage comes back as infinity.
	 */
	function axis(page: Page) {
		return page.locator('.page').evaluate((el) => {
			const x = parseFloat(getComputedStyle(el).transformOrigin.split(' ')[0]);
			return Math.round((x / (el as HTMLElement).offsetWidth) * 1000) / 10;
		});
	}

	/**
	 * Bare paper below the last row. Everything on the sheet that can be pressed
	 * owns a press already, so the turn only takes hold where none of them is.
	 */
	async function blankPaper(page: Page) {
		const box = (await page.locator('main').boundingBox())!;
		return { x: box.x + 30, y: box.y + box.height - 12 };
	}

	test('a drag rightwards turns the receipt over, the same way the panel goes back', async ({
		page
	}) => {
		await page.goto('/');
		const from = await blankPaper(page);

		expect(await angle(page)).toBe(0);
		expect(await axis(page)).toBe(50);

		await page.mouse.move(from.x, from.y);
		await page.mouse.down();
		// Under the flick, which is 40px however fast the hand was going.
		await page.mouse.move(from.x + 30, from.y, { steps: 6 });

		// Turned, and turned away from the reader on the right — the sheet's
		// half of the rotation, which is the negative one.
		expect(await angle(page)).toBeLessThan(0);

		// And the axis has given a little, the way a spun sheet's does.
		expect(await axis(page)).toBeGreaterThan(50);

		await page.mouse.up();
		await settle(page);

		// Short of the threshold, so it swings back up — and the axis comes home.
		expect(await angle(page)).toBe(0);
		expect(await axis(page)).toBe(50);
		await expect(page.getByRole('dialog', dialog)).toBeHidden();
	});

	test('a drag past the threshold carries on into the menu', async ({ page }) => {
		await page.goto('/');
		const from = await blankPaper(page);

		await page.mouse.move(from.x, from.y);
		await page.mouse.down();
		await page.mouse.move(from.x + 260, from.y, { steps: 10 });
		await page.mouse.up();

		await expect(page.getByRole('dialog', dialog)).toBeVisible();
		await settle(page);

		// The sheet is face down behind the panel, and the axis is back in the
		// middle rather than left wherever the hand pushed it.
		expect(await angle(page)).toBe(-90);
		expect(await axis(page)).toBe(50);
	});

	test('a finger going down the page still scrolls it', async ({ page }) => {
		await page.goto('/');
		const from = await blankPaper(page);

		await page.mouse.move(from.x, from.y);
		await page.mouse.down();
		// Mostly downwards. The turn gives the gesture up at the first sign.
		await page.mouse.move(from.x + 12, from.y + 90, { steps: 6 });

		expect(await angle(page)).toBe(0);

		await page.mouse.up();
		await expect(page.getByRole('dialog', dialog)).toBeHidden();
	});

	test('a press that belongs to a row is left to the row', async ({ page }) => {
		await page.goto('/');

		/*
		 * Dragging from the Add a task button must not turn the paper over: the
		 * sheet's own long presses live on controls like this one, and a receipt
		 * that turned over when someone meant to carry a row would be worse than
		 * one that only turns from bare paper.
		 */
		const box = (await page.getByRole('button', { name: 'Add a task' }).first().boundingBox())!;
		await page.mouse.move(box.x + 4, box.y + box.height / 2);
		await page.mouse.down();
		await page.mouse.move(box.x + 4 + 200, box.y + box.height / 2, { steps: 8 });
		await page.mouse.up();

		expect(await angle(page)).toBe(0);
		await expect(page.getByRole('dialog', dialog)).toBeHidden();
	});
});

test.describe('turning it back by hand', () => {
	/** Pull the panel rightwards, in pixels, and leave the button down. */
	async function pull(page: Page, distance: number, steps: number) {
		const box = (await page.getByRole('dialog', dialog).boundingBox())!;
		await page.mouse.move(box.x + 24, box.y + box.height / 2);
		await page.mouse.down();
		await page.mouse.move(box.x + 24 + distance, box.y + box.height / 2, { steps });
		return box;
	}

	test('a drag turns the paper rather than sliding it aside', async ({ page }) => {
		await page.goto('/');
		await menuButton(page).click();
		await settle(page);
		expect(await panelAngle(page)).toBe(0);

		/*
		 * Short of the flick — over 40px inside a quarter-second closes it, and
		 * that threshold has not moved; it is only what it is measured against
		 * that has.
		 */
		await pull(page, 30, 6);

		// Turned, and turned the way the paper goes round: left edge forward.
		expect(await panelAngle(page)).toBeGreaterThan(0);

		await page.mouse.up();
		await settle(page);

		// Not far enough, so it swings home rather than snapping there.
		expect(await panelAngle(page)).toBe(0);
		await expect(page.getByRole('dialog', dialog)).toBeVisible();
	});

	test('a drag past the threshold carries on into the turn', async ({ page }) => {
		await page.goto('/');
		await menuButton(page).click();
		await settle(page);

		await pull(page, 400, 8);
		await page.mouse.up();

		// The panel finishes the turn it was being given, and the sheet is back.
		await expect(page.getByRole('dialog', dialog)).toBeHidden();
		await settle(page);
		expect(await angle(page)).toBe(0);
	});
});
