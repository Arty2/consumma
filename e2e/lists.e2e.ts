import { expect, test, type Page } from '@playwright/test';
import { fromMenu, openMenu } from './menu';

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

/**
 * New list in the menu is the only way to reach a second list at all — the
 * pill that would otherwise offer it is not on the page until one exists.
 * The menu carries its own always-shown copy of the switcher for exactly
 * this reason; its dropdown is where "New list" lives now.
 */
async function newList(page: Page) {
	await openMenu(page);
	const dialog = page.getByRole('dialog', { name: 'Menu' });
	await dialog.locator('button[aria-haspopup="listbox"]').click();
	await dialog.getByRole('button', { name: 'New list', exact: true }).click();
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

	// Neither list has ever been synced, so the button reads DELETE.
	await fromMenu(page, 'Delete');
	await page.getByRole('button', { name: 'Delete', exact: true }).click();

	await expect(switcherPill(page)).toHaveCount(0);
	await expect(task(page, 'Bread')).toBeVisible();
	await expect(task(page, 'Milk')).toHaveCount(0);
});

test('deleting a list offers it back, and the switcher with it', async ({ page }) => {
	await addTask(page, 'Bread');
	await newList(page);
	await addTask(page, 'Milk');

	await fromMenu(page, 'Delete');
	await page.getByRole('button', { name: 'Delete', exact: true }).click();
	await expect(switcherPill(page)).toHaveCount(0);

	/*
	 * The whole index goes back, not just the row that went. Removing a list
	 * rewrites what is left, and the rewrite can take the index away
	 * altogether — one list under the bare keys needs none — so putting one
	 * row back into what that left behind restored the wrong shape and left
	 * the other list unreachable.
	 */
	await page.getByRole('button', { name: 'UNDO?' }).click();
	await expect(task(page, 'Milk')).toBeVisible();
	await expect(switcherPill(page)).toBeVisible();

	await page.reload();
	await expect(task(page, 'Milk')).toBeVisible();
	await expect(switcherPill(page)).toBeVisible();

	// And the one it was not on is still there to switch to.
	await switcherPill(page).dblclick();
	await expect(task(page, 'Bread')).toBeVisible();
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

test('the toast still lands on the corner row with the switcher sharing it', async ({ page }) => {
	await addTask(page, 'Bread');
	await newList(page);
	await addTask(page, 'Milk');

	await task(page, 'Milk').click();
	await page.getByRole('button', { name: 'Delete task' }).first().click();
	// The row pops before it actually goes, so the undo toast lands a beat
	// after the click rather than in the same tick.
	await page.locator('.toast').waitFor();
	// It comes down from above the paper now, so it has to have landed before
	// anything measures where it landed.
	await page
		.locator('.toast')
		.evaluate((el) => Promise.all(el.getAnimations().map((a) => a.finished)).then(() => undefined));

	const where = await page.evaluate(() => {
		const toast = document.querySelector('.toast')!.getBoundingClientRect();
		const burger = document.querySelector('[aria-label^="Menu"]')!.getBoundingClientRect();
		return { top: toast.top, cornerTop: burger.top };
	});

	/*
	 * The switcher rides this row too, and none of the three moves the line the
	 * toast stands on — bar the few pixels of `--toast-lead` that keep its drawn
	 * box off the burger's own ink.
	 */
	expect(where.top - where.cornerTop).toBeGreaterThanOrEqual(0);
	expect(where.top - where.cornerTop).toBeLessThan(6);
});

test('a dropdown row switches with the keyboard, not just a tap', async ({ page }) => {
	await addTask(page, 'Bread');
	await newList(page);
	await addTask(page, 'Milk');

	await switcherPill(page).click();
	await dropdown(page).getByRole('option', { selected: false }).focus();
	await page.keyboard.press('Enter');

	await expect(task(page, 'Bread')).toBeVisible();
	await expect(task(page, 'Milk')).toHaveCount(0);
});

test('a third list can be made from the menu without the sheet’s own pill causing ambiguity', async ({
	page
}) => {
	await addTask(page, 'Bread');
	await newList(page);
	await addTask(page, 'Milk');

	// The sheet's own pill is already on the page (2 lists exist) by the time
	// the menu opens for a second "New list" — the one call site where an
	// unscoped locator would find both the sheet's copy and the menu's.
	await newList(page);
	await addTask(page, 'Eggs');

	await switcherPill(page).click();
	await expect(dropdown(page).getByRole('option')).toHaveCount(3);
});

test('double-tapping the pill cycles to the next list, without opening the dropdown', async ({
	page
}) => {
	await addTask(page, 'Bread');
	await newList(page);
	await addTask(page, 'Milk');

	// Currently on the second list. A double tap jumps straight to the other
	// one — no dropdown, no click on a row.
	await switcherPill(page).dblclick();
	await expect(task(page, 'Bread')).toBeVisible();
	await expect(dropdown(page)).toHaveCount(0);

	await switcherPill(page).dblclick();
	await expect(task(page, 'Milk')).toBeVisible();
});

test('a single tap still opens the dropdown, after the pause that leaves room for a second tap', async ({
	page
}) => {
	await addTask(page, 'Bread');
	await newList(page);

	await switcherPill(page).click();
	await expect(dropdown(page)).toBeVisible();
});

test('opening the sheet’s own pill covers the page, the same as SYNC or IMPORT', async ({
	page
}) => {
	await addTask(page, 'Bread');
	await newList(page);

	await switcherPill(page).click();
	const modal = page.getByRole('dialog', { name: 'Switch list' });
	await expect(modal).toBeVisible();
	await expect(dropdown(page)).toBeVisible();

	// A real modal, not a small popover: Escape closes it, the same as every
	// other panel in the app.
	await page.keyboard.press('Escape');
	await expect(modal).toHaveCount(0);
});

test('the menu keeps its ✕ reachable once the switcher shares its row', async ({ page }) => {
	await addTask(page, 'Bread');
	await newList(page);

	await openMenu(page);
	// Would have thrown during the click itself if the switcher's own ground
	// intercepted the tap meant for the ✕ underneath it.
	await page.getByRole('button', { name: 'Close' }).click();
	await expect(page.getByRole('dialog')).toHaveCount(0);
});

test('a list nobody wrote on is forgotten as soon as it is left', async ({ page }) => {
	await addTask(page, 'Bread');
	await newList(page);

	// Two lists, so the pill has earned its place.
	await expect(switcherPill(page)).toBeVisible();

	// Back to the written one without putting anything on the blank one.
	await switcherPill(page).click();
	await dropdown(page).getByRole('option', { selected: false }).click();

	await expect(task(page, 'Bread')).toBeVisible();

	// The blank one went with the leaving: one list left, so the pill goes too.
	await expect(switcherPill(page)).toHaveCount(0);

	// And the index that recorded it goes with it, back to exactly the keys a
	// device that never had a second list writes.
	const keys = await page.evaluate(() => Object.keys(localStorage));
	expect(keys).not.toContain('consumma:lists');
	expect(keys).toContain('consumma:doc');
});

test('a list with nothing written on it cannot be synced', async ({ page }) => {
	await addTask(page, 'Bread');
	await newList(page);

	// Sitting on the blank list: there is nothing to send, and minting a code
	// for it would hand out the address of an empty sheet.
	await openMenu(page);
	await expect(page.getByRole('button', { name: /^Sync now/ })).toBeDisabled();

	// One word on it and it is a list like any other.
	await page.getByRole('button', { name: 'Close' }).click();
	await addTask(page, 'Milk');
	await openMenu(page);
	await expect(page.getByRole('button', { name: /^Sync now/ })).toBeEnabled();
});

/*
 * A group carried up to the switcher: the drag that already reorders groups,
 * given one more place to land. It is the only way off a sheet short of
 * retyping, and the list it makes is named after the group because a list is
 * named after its first group.
 */

/** Where the group titled `title` sits among its siblings, by title. */
function groupOrder(page: Page) {
	return page
		.locator('section[data-group] .title')
		.evaluateAll((titles) => titles.map((el) => el.textContent!.trim()));
}

async function addGroup(page: Page, title: string) {
	await page.getByRole('button', { name: 'Add a group' }).click();
	const name = page.getByRole('textbox', { name: 'New group' });
	await name.fill(title);
	await name.press('Enter');
	await page.keyboard.press('Escape');
}

/**
 * Held past both thresholds and carried up onto the switcher, which is only
 * there to be aimed at once the group is in hand — so its box is read after
 * the lift rather than before it. Left held: the caller lets go.
 */
async function carryToSwitcher(page: Page, title: string) {
	const from = (await page.getByRole('button', { name: title }).boundingBox())!;
	await page.mouse.move(from.x + from.width / 2, from.y + from.height / 2);
	await page.mouse.down();
	await page.waitForTimeout(600);

	await expect(switcherPill(page)).toBeVisible();
	const pill = (await switcherPill(page).boundingBox())!;
	await page.mouse.move(pill.x + pill.width / 2, pill.y + pill.height / 2, { steps: 12 });
	await page.waitForTimeout(50);
}

test('the switcher is not a target while the sheet has only one group', async ({ page }) => {
	await addTask(page, 'Bread');

	// One group, and moving it would move the list to itself. Nothing comes out
	// to be dropped on, so there is nothing there for the drag to find.
	const title = page.getByRole('button', { name: 'My list' });
	const box = (await title.boundingBox())!;
	await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
	await page.mouse.down();
	await page.waitForTimeout(600);
	await expect(switcherPill(page)).toHaveCount(0);
	await page.mouse.up();
});

test('a group carried to the switcher becomes a list of its own', async ({ page }) => {
	await addTask(page, 'Bread');
	await addGroup(page, 'Market');
	await addTask(page, 'Milk', 1);
	await addTask(page, 'Coffee', 1);
	await task(page, 'Coffee').click();

	expect(await groupOrder(page)).toStrictEqual(['My list', 'Market']);

	/*
	 * The pill is not on the page yet — there is only one list — so it comes out
	 * while the group is in hand, which is what says the drop is possible. The
	 * corner is reached by carrying the group up to it.
	 */
	await expect(switcherPill(page)).toHaveCount(0);

	await carryToSwitcher(page, 'Market');

	// Over it, the pill draws a box round itself — the same dashed mark every
	// other landing on the sheet is drawn with.
	await expect(switcherPill(page).locator('svg.rect path')).toHaveCount(1);
	await page.mouse.up();

	// Landed on a new list, named after the group, holding what the group held —
	// with the tick that was on it. Stored in the casing it was typed in; the
	// caps on the pill are CSS, as everywhere else.
	await expect(switcherPill(page)).toContainText('Market');
	expect(await switcherPill(page).innerText()).toContain('MARKET');
	expect(await groupOrder(page)).toStrictEqual(['Market']);
	await expect(task(page, 'Milk')).toBeVisible();
	await expect(task(page, 'Coffee')).toHaveAttribute('aria-checked', 'true');
	await expect(task(page, 'Bread')).toHaveCount(0);

	// And the move says so — the sheet underneath changed as well as the
	// group's place on it, so "Moved." on its own would leave the reader to
	// work out where they now are.
	await expect(
		page.getByRole('status').filter({ hasText: 'Moved to a new list' }).first()
	).toBeVisible();
});

test('undoing that puts the group back and takes the new list away', async ({ page }) => {
	await addTask(page, 'Bread');
	await addGroup(page, 'Market');
	await addTask(page, 'Milk', 1);

	await carryToSwitcher(page, 'Market');
	await page.mouse.up();
	await expect(switcherPill(page)).toContainText('Market');

	await page.getByRole('button', { name: 'UNDO?' }).click();

	// Back on the list it came from, with the group in place — and the list the
	// drop made is gone, so the pill goes with it.
	expect(await groupOrder(page)).toStrictEqual(['My list', 'Market']);
	await expect(task(page, 'Milk')).toBeVisible();
	await expect(task(page, 'Bread')).toBeVisible();
	await expect(switcherPill(page)).toHaveCount(0);

	// And it survives a reload, which is the only proof the index went with it.
	await page.reload();
	expect(await groupOrder(page)).toStrictEqual(['My list', 'Market']);
	await expect(switcherPill(page)).toHaveCount(0);
});
