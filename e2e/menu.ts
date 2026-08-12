import { expect, type Page } from '@playwright/test';

/*
 * Everything that is not the list itself is behind one button, so every test
 * that used to click a control on the page now goes through here.
 *
 * The button is labelled "Menu", and "Menu — 3 changes waiting to go" when
 * something is unsent; matching on the prefix covers both.
 */

export function menuButton(page: Page) {
	return page.getByRole('button', { name: /^Menu/ });
}

/**
 * Wait for the paper to stop turning.
 *
 * Opening the menu turns the sheet over, so for the length of the flip the
 * panel is edge-on and its box is a line. `toBeVisible` rides that out on its
 * own — it retries — but `boundingBox` does not, and several tests measure the
 * panel. Settling here covers every one of them, since they all come through
 * this file. The Escape below wants it too: the sheet takes half a turn to come
 * back, and a click that lands during it hits paper that is still moving.
 *
 * Waiting on the animations rather than on the list of them emptying: one that
 * has finished but holds its last frame — every `forwards` in the app — stays
 * in `getAnimations()` for as long as it is holding, so that list never empties
 * and waiting for it to is waiting for ever.
 */
export async function settle(page: Page) {
	await page.evaluate(() =>
		Promise.all(
			document
				.getAnimations()
				// The sync mark turns for as long as a sync is in flight, so its
				// `finished` never settles. Waiting on that would wait for ever.
				.filter((a) => a.effect?.getComputedTiming().iterations !== Infinity)
				// A cancelled animation rejects; either way it has stopped moving.
				.map((a) => a.finished.catch(() => undefined))
		)
	);
}

export async function openMenu(page: Page) {
	await page.keyboard.press('Escape');
	await settle(page);
	await menuButton(page).click();
	await expect(page.getByRole('dialog', { name: 'Menu' })).toBeVisible();
	await settle(page);
}

/**
 * Open the menu and press something in it. The labels are written in title
 * case and uppercased in CSS, so the accessible name comes back in caps —
 * hence a case-insensitive match rather than `exact`.
 */
export async function fromMenu(page: Page, name: string) {
	await openMenu(page);
	await page.getByRole('dialog', { name: 'Menu' }).getByRole('button', { name }).click();
}
