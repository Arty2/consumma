import { expect, test } from '@playwright/test';
import { menuButton, settle } from './menu';

/*
 * Somebody was sent a list and followed the link beside the code.
 *
 * The whole of what the link says is `?j`: not the code, not a room, not
 * anything about the list — only that whoever is arriving is holding a code.
 * What the app does with that is point at where the code goes, twice, in red,
 * and then get out of the way.
 */

test.beforeEach(async ({ page }) => {
	await page.goto('/');
	await page.evaluate(() => localStorage.clear());
});

/** The red layer, whichever mark it is currently drawing. */
const guide = (page: import('@playwright/test').Page) => page.locator('[data-guide-ink]');

test('a plain arrival is guided nowhere', async ({ page }) => {
	await page.reload();
	await expect(guide(page)).toHaveCount(0);
});

test('an invitation points at the burger, and the flag does not stay in the address', async ({
	page
}) => {
	await page.goto('/?j');
	await expect(guide(page)).toBeVisible();

	// The word beside the arrow is written, not drawn: it is real text in the
	// app's own face, and a screen reader never sees it because the layer is
	// hidden from the tree.
	await expect(guide(page).getByText('Join')).toBeVisible();

	/*
	 * The flag has done its work by the time the first mark is on screen, and a
	 * reload is not a fresh arrival. It goes, without a navigation and without
	 * leaving a Back press that would put it there again.
	 */
	expect(new URL(page.url()).search).toBe('');

	await page.reload();
	await expect(guide(page)).toHaveCount(0);
});

test('the arrow points at the burger and nothing else', async ({ page }) => {
	await page.goto('/?j');
	await expect(guide(page)).toBeVisible();

	/*
	 * It points, and it must never take the press it is pointing at. The layer
	 * covers the viewport, so this is the assertion that matters most about it:
	 * the button underneath still gets the click.
	 */
	await menuButton(page).click();
	await expect(page.getByRole('dialog', { name: 'Menu' })).toBeVisible();
});

test('it follows the paper over and loops the field the code goes in', async ({ page }) => {
	await page.goto('/?j');
	await expect(guide(page)).toBeVisible();

	await menuButton(page).click();
	await settle(page);

	const layer = guide(page);
	await expect(layer).toBeVisible();
	await expect(layer.getByText('Paste')).toBeVisible();

	/*
	 * The panel opens at the field rather than where it was last left: JOIN
	 * LIST is the last section of it, and an arrow pointing at something below
	 * the fold is an arrow pointing off the screen.
	 */
	const field = page.locator('[data-guide="code"]');
	await expect(field).toBeInViewport();

	/*
	 * One drawn mark, not two. The panel has no arrow: one had to end on a
	 * field a few millimetres tall, so its head came out smaller than the thing
	 * it pointed at. The ring says which thing and the word says what to do
	 * with it.
	 */
	expect(await layer.locator('svg path').count()).toBe(1);

	/*
	 * And the word stands clear of the ring rather than inside it — written
	 * beside a mark, the way a hand does, not laid over what the mark is round.
	 */
	const ring = (await field.boundingBox())!;
	const said = (await layer.getByText('Paste').boundingBox())!;
	expect(said.y).toBeGreaterThan(ring.y + ring.height);
});

test('a code landing in the field is the end of it', async ({ page }) => {
	await page.goto('/?j');
	await menuButton(page).click();
	await settle(page);

	await page.getByRole('textbox', { name: 'Code' }).fill('a1b2c3d4e5f6');
	await expect(guide(page)).toHaveCount(0);

	// And it does not come back when the paper turns back over.
	await page.keyboard.press('Escape');
	await settle(page);
	await expect(guide(page)).toHaveCount(0);
});

test('turning the paper back over puts it back on the burger', async ({ page }) => {
	await page.goto('/?j');
	await menuButton(page).click();
	await settle(page);
	await expect(guide(page).getByText('Paste')).toBeVisible();

	/*
	 * Somebody who opened the panel, did not find the field and turned the
	 * paper back over is exactly who this is for. It goes back to pointing at
	 * the way in rather than giving up.
	 */
	await page.keyboard.press('Escape');
	await settle(page);

	await expect(guide(page).getByText('Join')).toBeVisible();
});

test('anything else put it away', async ({ page }) => {
	await page.goto('/?j');
	await expect(guide(page)).toBeVisible();

	/*
	 * A hand pointing over your shoulder stops pointing the moment you start
	 * doing something of your own. On a phone this is the only way out that
	 * does not involve producing a code.
	 */
	await page.locator('main').click({ position: { x: 40, y: 320 } });
	await expect(guide(page)).toHaveCount(0);
});

test('the guidance is said out loud as well as drawn', async ({ page }) => {
	await page.goto('/?j');

	/*
	 * A red arrow says nothing to a screen reader, so the same thing is said in
	 * words through the live region the app already announces moves in — and
	 * the drawing itself is out of the tree entirely.
	 */
	await expect(page.getByText(/You were sent a list/)).toBeAttached();
	await expect(guide(page)).toHaveAttribute('aria-hidden', 'true');
});
