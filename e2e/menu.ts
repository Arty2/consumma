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

export async function openMenu(page: Page) {
	await page.keyboard.press('Escape');
	await menuButton(page).click();
	await expect(page.getByRole('dialog', { name: 'Menu' })).toBeVisible();
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
