import { expect, test, type Page } from '@playwright/test';
import { fromMenu } from './menu';

/*
 * The switcher: a device can remember more than one list, and the pill above
 * the sheet earns its place on the page only once there is a second one to
 * choose between. There is no server behind the preview — see flows.e2e.ts —
 * so these tests never involve a code; that half is already covered end to
 * end in sync.e2e.ts, and switching itself never touches the network.
 */

async function addTask(page: Page, text: string, groupIndex = 0) {
	await page.keyboard.press('Escape');
	await page.getByRole('button', { name: 'Add a task' }).nth(groupIndex).click();

	const input = page.getByRole('textbox', { name: 'New task' });
	await input.fill(text);
	await input.press('Enter');
	await page.keyboard.press('Escape');
}

function task(page: Page, text: string) {
	return page.getByRole('checkbox', { name: text });
}

/*
 * Not matched by name: a group titled "My list" carries that same accessible
 * name on its own title button, and the switcher's default first-group name
 * is exactly that. `aria-haspopup` is what only the pill has.
 */
function switcherPill(page: Page) {
	return page.locator('button[aria-haspopup="listbox"]');
}

function dropdown(page: Page) {
	return page.getByRole('listbox', { name: 'Lists' });
}

/** New list in the menu is the only way to reach a second list at all — the
 *  pill that would otherwise offer it is not on the page until one exists. */
async function newList(page: Page) {
	await fromMenu(page, 'New list');
	await expect(page.getByRole('dialog')).toHaveCount(0);
}

test.beforeEach(async ({ page }) => {
	await page.goto('/');
	await page.evaluate(() => localStorage.clear());
	await page.reload();
});

test('the switcher stays off the page while there is only one list', async ({ page }) => {
	await addTask(page, 'Bread');
	await expect(switcherPill(page)).toHaveCount(0);

	// The corner row itself is unaffected — same three controls, same order.
	await expect(page.locator('.corner')).toBeVisible();
});

test('New list makes a second, blank list and the switcher appears', async ({ page }) => {
	await addTask(page, 'Bread');
	await newList(page);

	await expect(switcherPill(page)).toBeVisible();

	// The new list is what is open now, and it is blank — the old task is not
	// carried across, because this is a second list rather than a rename.
	await expect(task(page, 'Bread')).toHaveCount(0);
	await expect(page.getByRole('checkbox')).toHaveCount(0);
});

test('the dropdown lists every remembered list, the open one marked', async ({ page }) => {
	await addTask(page, 'Bread');
	await newList(page);

	await switcherPill(page).click();
	const rows = dropdown(page).getByRole('option');

	await expect(rows).toHaveCount(2);
	await expect(dropdown(page).getByRole('option', { selected: true })).toHaveCount(1);
	await expect(dropdown(page).getByRole('button', { name: /new list/i })).toBeVisible();
});

test('switching keeps each list to its own tasks', async ({ page }) => {
	await addTask(page, 'Bread');
	await newList(page);
	await addTask(page, 'Milk');

	await expect(task(page, 'Milk')).toBeVisible();

	// The row that is not the one currently open is the first list.
	await switcherPill(page).click();
	await dropdown(page).getByRole('option', { selected: false }).click();

	await expect(task(page, 'Bread')).toBeVisible();
	await expect(task(page, 'Milk')).toHaveCount(0);

	// And back again.
	await switcherPill(page).click();
	await dropdown(page).getByRole('option', { selected: false }).click();

	await expect(task(page, 'Milk')).toBeVisible();
	await expect(task(page, 'Bread')).toHaveCount(0);
});

test('switching keeps each list its own collapsed groups', async ({ page }) => {
	await addTask(page, 'Bread');
	await page.getByRole('button', { name: 'Collapse group' }).click();
	await expect(page.getByRole('button', { name: 'Expand group' })).toBeVisible();

	await newList(page);
	// A fresh list starts expanded, whatever the last one was left as.
	await expect(page.getByRole('button', { name: 'Collapse group' })).toBeVisible();

	await switcherPill(page).click();
	await dropdown(page).getByRole('option', { selected: false }).click();

	// Back on the first list, still collapsed.
	await expect(page.getByRole('button', { name: 'Expand group' })).toBeVisible();
});

test('deleting the open list falls back to the other one, and the pill goes once only one is left', async ({
	page
}) => {
	await addTask(page, 'Bread');
	await newList(page);
	await addTask(page, 'Milk');

	await fromMenu(page, 'Delete');
	await page.getByRole('button', { name: 'Delete', exact: true }).click();

	await expect(switcherPill(page)).toHaveCount(0);
	await expect(task(page, 'Bread')).toBeVisible();
	await expect(task(page, 'Milk')).toHaveCount(0);
});

test('deleting every list leaves no trace, and the next edit lands under the same bare keys as ever', async ({
	page
}) => {
	await addTask(page, 'Bread');
	await newList(page);
	await addTask(page, 'Milk');

	await fromMenu(page, 'Delete');
	await page.getByRole('button', { name: 'Delete', exact: true }).click();
	await fromMenu(page, 'Delete');
	await page.getByRole('button', { name: 'Delete', exact: true }).click();

	await expect(page.getByRole('checkbox')).toHaveCount(0);

	const gone = await page.evaluate(() => Object.keys(localStorage));
	expect(gone).not.toContain('consumma:lists');
	expect(gone.filter((key) => key.startsWith('consumma:doc'))).toStrictEqual([]);
	expect(gone.filter((key) => key.startsWith('consumma:code'))).toStrictEqual([]);

	// A device that has deleted its way back to nothing writes exactly where a
	// device that has never had more than one list does — no stray suffix left
	// over from whichever slot happened to be open last.
	await addTask(page, 'Eggs');
	const after = await page.evaluate(() => Object.keys(localStorage));
	expect(after).toContain('consumma:doc');
});
