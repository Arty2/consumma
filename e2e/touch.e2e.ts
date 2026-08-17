import { expect, test, type Page } from '@playwright/test';

/*
 * The turn, under a finger.
 *
 * Everything else in this suite drives `page.mouse`, and a mouse is exempt
 * from `touch-action` and from the arbitration a browser does between a
 * movement that belongs to the page and one that belongs to whatever is
 * scrolling inside it. The gesture is built on both of those, so the mouse
 * tests were checking the arithmetic and nothing else — and a swipe that did
 * not work on a phone passed every time.
 *
 * These run in the `chromium-touch` project, which is a phone.
 */

const dialog = { name: 'Menu' } as const;

/** How far something is turned, in degrees. Nought is face up. */
function turned(el: Element) {
	const m = new DOMMatrix(getComputedStyle(el).transform);
	return Math.round((Math.atan2(-m.m13, m.m11) * 180) / Math.PI) || 0;
}

/**
 * A real finger, dispatched through the browser's own touch pipeline.
 *
 * `page.touchscreen` can only tap, and a synthesised `TouchEvent` from inside
 * the page is not a gesture — neither would make the browser decide between
 * scrolling and letting the page have the movement, which is the whole of what
 * is under test.
 */
async function swipe(
	page: Page,
	from: { x: number; y: number },
	by: { dx: number; dy?: number },
	steps = 8
) {
	const cdp = await page.context().newCDPSession(page);
	const dy = by.dy ?? 0;

	await cdp.send('Input.dispatchTouchEvent', {
		type: 'touchStart',
		touchPoints: [{ x: from.x, y: from.y }]
	});

	for (let i = 1; i <= steps; i++) {
		await cdp.send('Input.dispatchTouchEvent', {
			type: 'touchMove',
			touchPoints: [{ x: from.x + (by.dx * i) / steps, y: from.y + (dy * i) / steps }]
		});
	}

	await cdp.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] });
	await cdp.detach();
}

/** Let both halves of the turn finish. `--flip` is 150ms each way. */
async function settle(page: Page) {
	await page.waitForTimeout(500);
}

test.beforeEach(async ({ page }) => {
	await page.goto('/');
	await page.evaluate(() => localStorage.clear());
	await page.reload();
});

test('a finger drags the sheet over to the menu', async ({ page }) => {
	const box = (await page.locator('main').boundingBox())!;

	// From bare paper near the foot, well clear of the rows and the corner row.
	await swipe(page, { x: box.x + 20, y: box.y + box.height - 20 }, { dx: 240 });
	await settle(page);

	await expect(page.getByRole('dialog', dialog)).toBeVisible();
});

test('and a finger drags the panel back again', async ({ page }) => {
	/*
	 * The one that did not work. The panel slid its lead-in and then stopped:
	 * its scroller takes vertical panning, its handler read only the sideways
	 * part of the movement, and Chrome — having been given no reason to think
	 * the gesture was the page's — claimed it and cancelled the pointer partway
	 * through, which is exactly between the end of the slide and the start of
	 * the turn.
	 */
	await page.getByRole('button', { name: 'Menu' }).tap();
	await expect(page.getByRole('dialog', dialog)).toBeVisible();
	await settle(page);

	const panel = (await page.getByRole('dialog', dialog).boundingBox())!;
	await swipe(page, { x: panel.x + 24, y: panel.y + panel.height / 2 }, { dx: 260 });
	await settle(page);

	await expect(page.getByRole('dialog', dialog)).toBeHidden();
});

test('a drag with a little drift in it is still a drag', async ({ page }) => {
	// A finger is never level. A few pixels of wander must not hand the gesture
	// to the scroller.
	await page.getByRole('button', { name: 'Menu' }).tap();
	await expect(page.getByRole('dialog', dialog)).toBeVisible();
	await settle(page);

	const panel = (await page.getByRole('dialog', dialog).boundingBox())!;
	await swipe(page, { x: panel.x + 24, y: panel.y + panel.height / 2 }, { dx: 260, dy: 40 });
	await settle(page);

	await expect(page.getByRole('dialog', dialog)).toBeHidden();
});

test('and a finger drags it back the other way just as well', async ({ page }) => {
	/*
	 * The paper follows the hand. Swiping left to put the panel away is the same
	 * gesture mirrored, and it turns the receipt the other way round rather than
	 * refusing — which is what a receipt spun between two fingers does.
	 */
	await page.getByRole('button', { name: 'Menu' }).tap();
	await expect(page.getByRole('dialog', dialog)).toBeVisible();
	await settle(page);

	const panel = (await page.getByRole('dialog', dialog).boundingBox())!;
	await swipe(page, { x: panel.x + panel.width - 24, y: panel.y + panel.height / 2 }, { dx: -260 });
	await settle(page);

	await expect(page.getByRole('dialog', dialog)).toBeHidden();
	expect(await page.locator('.page').evaluate(turned)).toBe(0);
});

test('a finger going down the panel scrolls it rather than turning it', async ({ page }) => {
	await page.getByRole('button', { name: 'Menu' }).tap();
	await expect(page.getByRole('dialog', dialog)).toBeVisible();
	await settle(page);

	const panel = (await page.getByRole('dialog', dialog).boundingBox())!;
	await swipe(
		page,
		{ x: panel.x + panel.width / 2, y: panel.y + panel.height * 0.7 },
		{
			dx: 6,
			dy: -260
		}
	);
	await settle(page);

	// Still here, and flat: the panel is what scrolls, and it did.
	await expect(page.getByRole('dialog', dialog)).toBeVisible();
	expect(await page.getByRole('dialog', dialog).evaluate(turned)).toBe(0);
	expect(await page.locator('.scroll').evaluate((el) => el.scrollTop)).toBeGreaterThan(0);
});

test('a tap on a button in the panel is still a tap', async ({ page }) => {
	await page.getByRole('button', { name: 'Menu' }).tap();
	await expect(page.getByRole('dialog', dialog)).toBeVisible();
	await settle(page);

	const toggle = page.getByRole('button', { name: /^debug:/i });
	await expect(toggle).toHaveText(/off/i);
	await toggle.tap();
	await expect(toggle).toHaveText(/on/i);
	await expect(page.getByRole('dialog', dialog)).toBeVisible();
});
