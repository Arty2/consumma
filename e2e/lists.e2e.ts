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

	await fromMenu(page, 'Leave');
	await page.getByRole('button', { name: 'Leave', exact: true }).click();

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

	await fromMenu(page, 'Leave');
	await page.getByRole('button', { name: 'Leave', exact: true }).click();
	await fromMenu(page, 'Leave');
	await page.getByRole('button', { name: 'Leave', exact: true }).click();

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

	const where = await page.evaluate(() => {
		const toast = document.querySelector('.toast')!.getBoundingClientRect();
		const burger = document.querySelector('[aria-label^="Menu"]')!.getBoundingClientRect();
		return { top: toast.top, cornerTop: burger.top };
	});

	// The switcher rides this row too, and none of the three moves the line
	// the toast stands on.
	expect(where.top).toBeCloseTo(where.cornerTop, 0);
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

test('the pill reads bolder than the surrounding chrome', async ({ page }) => {
	await addTask(page, 'Bread');
	await newList(page);

	const weight = await switcherPill(page)
		.locator('.label')
		.evaluate((el) => getComputedStyle(el).fontWeight);
	expect(Number(weight)).toBeGreaterThan(400);
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

test('the menu’s own rows stay left-aligned, the same as the sheet’s', async ({ page }) => {
	await addTask(page, 'Bread');
	await newList(page);

	await openMenu(page);
	const dialog = page.getByRole('dialog', { name: 'Menu' });
	await dialog.locator('button[aria-haspopup="listbox"]').click();
	await dialog.getByRole('listbox', { name: 'Lists' }).waitFor();

	const align = await dialog
		.getByRole('option')
		.first()
		.evaluate((el) => getComputedStyle(el).justifyContent);
	expect(align).not.toBe('center');
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

test('a long name gives way in the pill, the code never does, and the rule follows both', async ({
	page
}) => {
	// A code planted rather than synced: there is no server behind the preview,
	// and what is under test is what the pill does with one, not how it got it.
	await page.evaluate(() => localStorage.setItem('consumma:code', '5e6b7c1a93f2'));
	await page.reload();

	await addTask(page, 'Bread');
	await page.locator('section .title').first().dblclick();
	await page
		.getByRole('textbox', { name: 'Group title' })
		.fill('A very long list name indeed that must give way');
	await page.getByRole('textbox', { name: 'Group title' }).press('Enter');
	await page.keyboard.press('Escape');

	await openMenu(page);
	const dialog = page.getByRole('dialog', { name: 'Menu' });

	// Four characters, whole, however little room the name is left. Named
	// `.tail` rather than `.code` so it never collides with the panel's own
	// full-code display — see ListSwitcher.svelte.
	await expect(dialog.locator('.pill .tail')).toHaveText('— 93f2');
	// And exactly one `.code` on the panel, which is that full display.
	await expect(dialog.locator('.code')).toHaveCount(1);

	const geo = await page.evaluate(() => {
		const dialogEl = document.querySelector('[role="dialog"]')!;
		const pill = dialogEl.querySelector('button[aria-haspopup="listbox"]') as HTMLElement;
		const label = pill.querySelector('.label') as HTMLElement;
		const tail = pill.querySelector('.tail') as HTMLElement;
		const rule = dialogEl.querySelector('svg.rule')!.getBoundingClientRect();
		const box = pill.getBoundingClientRect();
		const close = document.querySelector('.close')!.getBoundingClientRect();

		return {
			nameClipped: label.scrollWidth > label.clientWidth,
			codeClipped: tail.scrollWidth > tail.clientWidth,
			codeWidth: tail.getBoundingClientRect().width,
			pillLeft: box.left,
			pillWidth: box.width,
			pillRight: box.right,
			ruleLeft: rule.left,
			ruleWidth: rule.width,
			closeLeft: close.left
		};
	});

	// The name is what an ellipsis takes; the code is drawn in full.
	expect(geo.nameClipped).toBe(true);
	expect(geo.codeClipped).toBe(false);
	expect(geo.codeWidth).toBeGreaterThan(0);

	// The rule starts where the pill starts — both left, as the rows they open
	// are — and is no wider than the words it marks: a pen underlines the
	// word, not the row.
	expect(Math.abs(geo.ruleLeft - geo.pillLeft)).toBeLessThan(2);
	expect(geo.ruleWidth).toBeLessThanOrEqual(geo.pillWidth + 1);

	// And it never reaches the ✕ it shares a row with.
	expect(geo.pillRight).toBeLessThanOrEqual(geo.closeLeft + 1);
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

test('a long list name truncates in a row rather than overflowing it, in either context', async ({
	page
}) => {
	await addTask(page, 'Bread');
	await newList(page);

	await page.locator('section .title').first().dblclick();
	await page
		.getByRole('textbox', { name: 'Group title' })
		.fill('A very long list name that would otherwise overflow the row it sits in');
	await page.getByRole('textbox', { name: 'Group title' }).press('Enter');
	await page.keyboard.press('Escape');

	// The sheet's own modal.
	await switcherPill(page).click();
	await dropdown(page).waitFor();
	const sheetRow = await page.evaluate(() => {
		const row = document.querySelector('.listbox .row')!.getBoundingClientRect();
		const box = document.querySelector('.listbox')!.getBoundingClientRect();
		return row.width <= box.width + 1;
	});
	expect(sheetRow).toBe(true);
	await page.keyboard.press('Escape');

	// The menu's own in-flow copy — same row styling, and the pill itself
	// (which carries the active list's own name) must not spill into the ✕.
	await openMenu(page);
	const dialog = page.getByRole('dialog', { name: 'Menu' });
	await dialog.locator('button[aria-haspopup="listbox"]').click();
	await dialog.getByRole('listbox', { name: 'Lists' }).waitFor();

	const menuGeo = await page.evaluate(() => {
		const row = document.querySelector('.dropdown.menu .row')!.getBoundingClientRect();
		const box = document.querySelector('.dropdown.menu')!.getBoundingClientRect();
		const pill = document.querySelector('button[aria-haspopup="listbox"]')!.getBoundingClientRect();
		const close = document.querySelector('.close')!.getBoundingClientRect();
		return { rowFits: row.width <= box.width + 1, pillRight: pill.right, closeLeft: close.left };
	});
	expect(menuGeo.rowFits).toBe(true);
	expect(menuGeo.pillRight).toBeLessThanOrEqual(menuGeo.closeLeft);
});
