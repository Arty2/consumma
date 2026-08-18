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
		expect(await angle(page)).toBe(90);

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

test.describe('the edge that comes forward', () => {
	/*
	 * The sheet's edges are drawn to a height they have to be measured for, so
	 * there is a frame after navigation where the paper is on screen and its
	 * sides are not yet ink. Reading the weight in that frame gives `null`, and
	 * `null` is indistinguishable from an edge drawn at no weight at all — so
	 * under a loaded machine these tests failed on the reading rather than on
	 * the thing they are about. Waited for once, at the start, rather than
	 * folded into `weight`: mid-drag a `null` is a real answer.
	 */
	async function inked(page: Page) {
		await page.locator('.page svg.edge.left path').waitFor();
	}

	/**
	 * The drawn weight of one side edge, in pixels.
	 *
	 * `strokeWidth` comes back as `calc(2.8px)` where the value is a `calc` the
	 * browser has not flattened, so the number is dug out rather than parsed off
	 * the front — `parseFloat('calc(2.8px)')` is NaN.
	 */
	function weight(page: Page, root: string, side: 'left' | 'right') {
		return page.evaluate(
			([r, s]) => {
				const path = document.querySelector(`${r} svg.edge.${s} path`);
				if (!path) return null;
				const raw = getComputedStyle(path).strokeWidth;
				return Number(raw.match(/-?[\d.]+/)![0]);
			},
			[root, side] as const
		);
	}

	test('the near edge reaches its full weight, and the far one is left alone', async ({ page }) => {
		await page.goto('/');
		await inked(page);

		const base = (await weight(page, '.page', 'left'))!;
		expect(base).toBeGreaterThan(0);
		// Flat paper: both sides the same, because neither is nearer.
		expect(await weight(page, '.page', 'right')).toBe(base);

		await menuButton(page).click();
		await settle(page);

		/*
		 * A hand pushing the paper rightwards sends the side under it back and
		 * brings the far side forward, so it is the left edge that came towards
		 * the reader and carries the weight.
		 *
		 * The drawn width is not the wanted multiple. It is that multiple with
		 * the compression the turn is about to apply divided back out of it, so
		 * at the quarter — where the paper is edge-on and the compression is
		 * total — it stands at the cap. What is three times is what reaches the
		 * screen, and no computed style can say that.
		 *
		 * The right edge went away and is untouched, *exactly* untouched, which
		 * is the assertion that matters: the correction is weighted by how near
		 * an edge is, and the version before this applied it to both and had the
		 * far edge thickening as the paper went edge-on.
		 */
		expect(await weight(page, '.page', 'left')).toBeGreaterThan(base * 2);
		expect(await weight(page, '.page', 'right')).toBe(base);

		// The panel arrived leading with its left, and has settled back to flat.
		expect(await weight(page, '[role="dialog"]', 'left')).toBe(base);
		expect(await weight(page, '[role="dialog"]', 'right')).toBe(base);

		await page.getByRole('button', { name: 'Close' }).click();
		await settle(page);

		// Home again, and nothing left heavy behind.
		expect(await weight(page, '.page', 'left')).toBe(base);
		expect(await weight(page, '.page', 'right')).toBe(base);
	});

	test('the weight ramps with the turn rather than stepping halfway', async ({ page }) => {
		await page.goto('/');
		await inked(page);
		const base = (await weight(page, '.page', 'left'))!;

		/*
		 * It stepped for a long time and looked like nothing was happening: a
		 * `calc()` that stays a `calc()` at computed-value time does not
		 * interpolate, and the browser falls back to discrete — from one weight
		 * to the other at the halfway mark, with nothing in between. Nothing
		 * says so; the only sign is that the effect is invisible.
		 *
		 * So this samples the middle of the turn and insists on finding values
		 * that are neither end.
		 */
		await menuButton(page).click();

		const seen = new Set<number>();
		for (let i = 0; i < 9; i++) {
			const w = await weight(page, '.page', 'left');
			if (w !== null) seen.add(Math.round(w * 100) / 100);
			await page.waitForTimeout(16);
		}

		const between = [...seen].filter((w) => w > base + 0.05 && w < base * 3 - 0.05);
		expect(between.length, `saw only ${[...seen].join(', ')}`).toBeGreaterThan(1);
	});

	test('nothing is weighted while the paper is only sliding', async ({ page }) => {
		await page.goto('/');
		await inked(page);
		const base = (await weight(page, '.page', 'left'))!;

		const box = (await page.locator('main').boundingBox())!;
		const y = box.y + box.height - 12;
		await page.mouse.move(box.x + 30, y);
		await page.mouse.down();

		/*
		 * A sheet pushed sideways goes sideways first, and a paper that is not
		 * turning has no near edge. Inside the lead-in the weight is the weight
		 * it always was.
		 */
		await page.mouse.move(box.x + 30 + 14, y, { steps: 3 });
		expect(await angle(page)).toBe(0);
		expect(await weight(page, '.page', 'left')).toBe(base);
		expect(await weight(page, '.page', 'right')).toBe(base);

		/*
		 * And it has moved, rather than sitting in a dead zone doing nothing.
		 * Read off `translate` and not `transform`: they are separate properties
		 * here on purpose, so that the slide and the turn compose without either
		 * having to know about the other.
		 */
		const slid = await page.locator('.page').evaluate((el) => {
			return parseFloat(getComputedStyle(el).translate) || 0;
		});
		expect(slid).toBeGreaterThan(0);

		await page.mouse.up();
		await settle(page);
	});

	test('springing home never makes the edge heavier on the way back', async ({ page }) => {
		await page.goto('/');
		await inked(page);
		const base = (await weight(page, '.page', 'left'))!;

		const box = (await page.locator('main').boundingBox())!;
		const y = box.y + box.height - 12;
		await page.mouse.move(box.x + 30, y);
		await page.mouse.down();
		await page.mouse.move(box.x + 30 + 70, y, { steps: 6 });

		const held = (await weight(page, '.page', 'left'))!;
		expect(held).toBeGreaterThan(base);

		/*
		 * Let go short of the threshold and the paper straightens up. Its near
		 * edge is going away from the reader the whole time, so the weight can
		 * only fall. It used to spring from the peak instead of from where the
		 * finger left it, so the line got heavier as the paper flattened —
		 * backwards, and the wrong way round twice over.
		 */
		await page.mouse.up();

		for (let i = 0; i < 8; i++) {
			const w = await weight(page, '.page', 'left');
			if (w !== null)
				expect(w, `heavier than the ${held} it was let go at`).toBeLessThan(held + 0.05);
			await page.waitForTimeout(16);
		}

		await settle(page);
		expect(await weight(page, '.page', 'left')).toBe(base);
	});

	test('the near edge is the one the push brings round, whichever way it went', async ({
		page
	}) => {
		/*
		 * Which edge is nearer is a reading of the rotation and nothing else, so
		 * it swaps sides with the direction without being told: `--near` is the
		 * sign of the sine, and a leftward push makes that negative. Pushed right
		 * the left edge comes forward; pushed left it is the right one.
		 */
		await page.goto('/');
		await inked(page);
		const base = (await weight(page, '.page', 'left'))!;

		const box = (await page.locator('main').boundingBox())!;
		const y = box.y + box.height - 12;
		const from = box.x + box.width - 30;

		await page.mouse.move(from, y);
		await page.mouse.down();
		await page.mouse.move(from - 70, y, { steps: 6 });

		expect(await weight(page, '.page', 'right')).toBeGreaterThan(base);
		expect(await weight(page, '.page', 'left')).toBe(base);

		await page.mouse.up();
		await settle(page);
	});

	test('a finger turning the paper takes the edge with it', async ({ page }) => {
		await page.goto('/');
		await inked(page);
		const base = (await weight(page, '.page', 'left'))!;

		const box = (await page.locator('main').boundingBox())!;
		await page.mouse.move(box.x + 30, box.y + box.height - 12);
		await page.mouse.down();
		/*
		 * Past the slide and the overdrag so the paper is turning, and under the
		 * 40px flick — which is measured on the turn itself, so that is 40 past
		 * the dead travel rather than 40 from the touch.
		 */
		await page.mouse.move(box.x + 30 + 70, box.y + box.height - 12, { steps: 6 });

		const near = (await weight(page, '.page', 'left'))!;
		expect(near).toBeGreaterThan(base);
		expect(near).toBeLessThanOrEqual(base * 3);
		// The far edge does not move, however far the hand goes.
		expect(await weight(page, '.page', 'right')).toBe(base);

		await page.mouse.up();
		await settle(page);
		expect(await weight(page, '.page', 'left')).toBe(base);
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
		// Past the slide and the overdrag, and under the flick — both of which
		// are measured on the part of the drag that turns the paper.
		await page.mouse.move(from.x + 70, from.y, { steps: 6 });

		// Turned the way a hand pushes it: the side under the finger goes back,
		// the far side comes forward. That is the positive rotation.
		expect(await angle(page)).toBeGreaterThan(0);

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
		expect(await angle(page)).toBe(90);
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

	test('a push leftwards turns the paper the other way', async ({ page }) => {
		/*
		 * The paper follows the hand. A receipt spun between two fingers goes
		 * whichever way it is pushed, and so does this — the sheet used to answer
		 * a rightward drag and ignore everything else, which made half of the one
		 * gesture it has do nothing at all.
		 */
		await page.goto('/');

		const box = (await page.locator('main').boundingBox())!;
		const y = box.y + box.height - 12;
		const from = box.x + box.width - 30;

		// Seventy, as the rightward case uses: past the dead travel and under the
		// forty pixels of turn that a quick flick commits on.
		await page.mouse.move(from, y);
		await page.mouse.down();
		await page.mouse.move(from - 70, y, { steps: 6 });

		// The other way round from a rightward push.
		expect(await angle(page)).toBeLessThan(0);

		// And short of the threshold, so it swings back rather than going over.
		await page.mouse.up();
		await settle(page);
		expect(await angle(page)).toBe(0);
		await expect(page.getByRole('dialog', dialog)).toBeHidden();
	});

	test('a push leftwards that goes far enough opens the menu too', async ({ page }) => {
		await page.goto('/');

		const box = (await page.locator('main').boundingBox())!;
		const y = box.y + box.height - 12;
		const from = box.x + box.width - 30;

		await page.mouse.move(from, y);
		await page.mouse.down();
		await page.mouse.move(from - 260, y, { steps: 10 });
		await page.mouse.up();

		await expect(page.getByRole('dialog', dialog)).toBeVisible();
		await settle(page);
	});

	test('a thumb can turn the paper most of the way over on a phone', async ({ page }) => {
		/*
		 * The paper on a phone is the screen. Geared to the full width, a quarter
		 * turn wanted four hundred and sixteen pixels of drag on a three hundred
		 * and ninety pixel screen — so the paper could not be turned over by hand
		 * at all, and every gesture ended by falling over from whatever small
		 * angle the thumb had run out of room at.
		 */
		await page.setViewportSize({ width: 390, height: 760 });
		await page.goto('/');

		const box = (await page.locator('main').boundingBox())!;
		const y = box.y + box.height - 20;
		const x = box.x + 4;

		await page.mouse.move(x, y);
		await page.mouse.down();
		// Slowly, so this is about reach and not about the flick threshold.
		await page.mouse.move(x + 300, y, { steps: 20 });

		// All but there, by hand, with room to spare on the screen.
		expect(await angle(page)).toBeGreaterThan(80);

		await page.mouse.up();
		await settle(page);
		await expect(page.getByRole('dialog', dialog)).toBeVisible();
	});

	test('it falls over once it is past halfway, and not before', async ({ page }) => {
		await page.setViewportSize({ width: 390, height: 760 });

		/** Drag slowly to `distance`, let go, and say whether it went over. */
		async function pushTo(distance: number) {
			await page.goto('/');
			const box = (await page.locator('main').boundingBox())!;
			const y = box.y + box.height - 20;
			const x = box.x + 4;

			await page.mouse.move(x, y);
			await page.mouse.down();
			await page.mouse.move(x + distance, y, { steps: 20 });
			const deg = await angle(page);
			await page.mouse.up();
			await settle(page);

			const open = (await page.getByRole('dialog', dialog).count()) > 0;
			return { deg, open };
		}

		// Short of the middle it comes back, which is what a receipt held on its
		// edge does.
		const shy = await pushTo(120);
		expect(shy.deg).toBeLessThan(45);
		expect(shy.open).toBe(false);

		// Past it, it falls the rest of the way on its own.
		const over = await pushTo(200);
		expect(over.deg).toBeGreaterThan(45);
		expect(over.open).toBe(true);
	});

	test('the animation plays only what the hand left of the turn', async ({ page }) => {
		/*
		 * It used to take the full duration however far round the finger had
		 * already carried it, so a small push was flung through eighty degrees at
		 * a speed the hand had never been going — which is what read as a jump
		 * rather than as the paper carrying on.
		 */
		await page.setViewportSize({ width: 390, height: 760 });

		/** The length of the sheet's own half, in milliseconds, at release. */
		async function playing(distance: number) {
			await page.goto('/');
			const box = (await page.locator('main').boundingBox())!;
			const y = box.y + box.height - 20;
			const x = box.x + 4;

			await page.mouse.move(x, y);
			await page.mouse.down();
			await page.mouse.move(x + distance, y, { steps: 20 });
			await page.mouse.up();

			const ms = await page
				.locator('.page')
				.evaluate((el) => parseFloat(getComputedStyle(el).animationDuration) * 1000);
			await settle(page);
			if (await page.getByRole('dialog', dialog).count()) {
				await page.keyboard.press('Escape');
				await settle(page);
			}
			return ms;
		}

		// Let go just past the middle and about half of it is left to play; let
		// go with the paper all but edge-on and there is next to nothing.
		const fromHalfway = await playing(140);
		const fromNearlyThere = await playing(300);

		expect(fromHalfway).toBeGreaterThan(fromNearlyThere * 2);
		expect(fromNearlyThere).toBeLessThan(30);
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
		await pull(page, 70, 6);

		// Turned the way every face leaves, which is the way the hand pushed it —
		// the same movement the sheet makes on its way out.
		expect(await panelAngle(page)).toBeGreaterThan(0);

		await page.mouse.up();
		await settle(page);

		// Not far enough, so it swings home rather than snapping there.
		expect(await panelAngle(page)).toBe(0);
		await expect(page.getByRole('dialog', dialog)).toBeVisible();
	});

	test('swiping the same way again keeps it spinning the same way', async ({ page }) => {
		await page.goto('/');

		/*
		 * The receipt is one object being spun, so a second swipe rightwards
		 * carries the rotation on rather than winding it back. Every face leaves
		 * leading with its right edge and arrives settling out of its left,
		 * whichever face it is — so both turns look the same, and this samples
		 * both and checks that they do.
		 */
		/*
		 * Read with `querySelector` rather than through a locator: the panel is
		 * taken away at the end of its half of the turn, and a locator asked for
		 * an element that has gone waits the full timeout for it to come back
		 * instead of saying so. Nothing there reads as nought and is filtered
		 * out with the frames where the paper is flat or already edge-on.
		 */
		const leaving = async (selector: string) => {
			const seen: number[] = [];
			for (let i = 0; i < 6; i++) {
				seen.push(
					await page.evaluate((s) => {
						const el = document.querySelector(s);
						if (!el) return 0;
						const m = new DOMMatrix(getComputedStyle(el).transform);
						return Math.round((Math.atan2(-m.m13, m.m11) * 180) / Math.PI) || 0;
					}, selector)
				);
				await page.waitForTimeout(20);
			}
			return seen.filter((deg) => deg !== 0 && deg !== 90);
		};

		// First swipe: the sheet goes, leading with its right edge.
		await menuButton(page).click();
		const sheetOut = await leaving('.page');
		await settle(page);
		expect(sheetOut.length).toBeGreaterThan(0);
		for (const deg of sheetOut) expect(deg).toBeGreaterThan(0);

		// Second swipe, the same way: the panel goes, and goes the same way —
		// not back along the arc the sheet came in by.
		await page.getByRole('button', { name: 'Close' }).click();
		const panelOut = await leaving('[role="dialog"]');
		expect(panelOut.length).toBeGreaterThan(0);
		for (const deg of panelOut) expect(deg).toBeGreaterThan(0);

		await settle(page);
		expect(await angle(page)).toBe(0);
	});

	test('a drag that starts on a button still turns the paper', async ({ page }) => {
		await page.goto('/');
		await menuButton(page).click();
		await settle(page);

		/*
		 * Most of the panel is buttons. The sheet bails on anything pressable
		 * because its rows own a long press already; nothing here does, so a
		 * finger that starts on a button and travels is turning the paper.
		 */
		const box = (await page.getByRole('button', { name: /sync now/i }).boundingBox())!;
		await page.mouse.move(box.x + 8, box.y + box.height / 2);
		await page.mouse.down();
		await page.mouse.move(box.x + 8 + 260, box.y + box.height / 2, { steps: 10 });
		await page.mouse.up();

		await expect(page.getByRole('dialog', dialog)).toBeHidden();
		await settle(page);
		expect(await angle(page)).toBe(0);
	});

	test('the panel goes back on a push leftwards as readily as rightwards', async ({ page }) => {
		await page.goto('/');
		await menuButton(page).click();
		await settle(page);
		expect(await panelAngle(page)).toBe(0);

		const box = (await page.getByRole('dialog', dialog).boundingBox())!;
		const from = box.x + box.width - 24;
		await page.mouse.move(from, box.y + box.height / 2);
		await page.mouse.down();
		await page.mouse.move(from - 70, box.y + box.height / 2, { steps: 6 });

		// The way the hand went, which is the other way from a rightward push.
		expect(await panelAngle(page)).toBeLessThan(0);

		// Far enough and it goes, exactly as it does the other way.
		await page.mouse.move(from - 260, box.y + box.height / 2, { steps: 10 });
		await page.mouse.up();
		await settle(page);

		await expect(page.getByRole('dialog', dialog)).toBeHidden();
		expect(await angle(page)).toBe(0);
	});

	test('a tap on a button is still a tap, not a turn', async ({ page }) => {
		await page.goto('/');
		await menuButton(page).click();
		await settle(page);

		/*
		 * The other half of letting the drag start on a button: pressing one has
		 * to go on working. The debug toggle flips in place and says so, which makes
		 * it the one button here that can be pressed and checked without leaving
		 * the panel or touching the network.
		 */
		const toggle = page.getByRole('button', { name: /^debug:/i });
		await expect(toggle).toHaveText(/off/i);
		await toggle.click();
		await expect(toggle).toHaveText(/on/i);
		await expect(page.getByRole('dialog', dialog)).toBeVisible();
	});

	test('a drag that crosses a button does not press it', async ({ page }) => {
		await page.goto('/');
		await menuButton(page).click();
		await settle(page);

		/*
		 * The other half of letting a drag start on a button. Short enough that
		 * the paper springs back, so the panel is still here to be checked — and
		 * the toggle it started on has not changed its mind.
		 */
		const toggle = page.getByRole('button', { name: /^debug:/i });
		await expect(toggle).toHaveText(/off/i);

		const box = (await toggle.boundingBox())!;
		await page.mouse.move(box.x + 8, box.y + box.height / 2);
		await page.mouse.down();
		await page.mouse.move(box.x + 8 + 70, box.y + box.height / 2, { steps: 6 });
		await page.mouse.up();
		await settle(page);

		await expect(page.getByRole('dialog', dialog)).toBeVisible();
		await expect(toggle).toHaveText(/off/i);
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
