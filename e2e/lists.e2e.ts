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

test('the dropdown lists every list but the one already open', async ({ page }) => {
	await addTask(page, 'Bread');
	await newList(page);

	await switcherPill(page).click();

	/*
	 * Two lists, one row: the pill directly above says which list this is, so a
	 * column that repeated it answered "which one am I on" twice a centimetre
	 * apart, one of those a row that did nothing when tapped.
	 */
	await expect(dropdown(page).getByRole('option')).toHaveCount(1);
	await expect(dropdown(page).getByRole('option', { selected: true })).toHaveCount(0);
	await expect(dropdown(page).getByRole('button', { name: /new list/i })).toBeVisible();
});

test('switching keeps each list to its own tasks', async ({ page }) => {
	await addTask(page, 'Bread');
	await newList(page);
	await addTask(page, 'Milk');

	await expect(task(page, 'Milk')).toBeVisible();

	// The row that is not the one currently open is the first list.
	await switcherPill(page).click();
	await dropdown(page).getByRole('option').first().click();

	await expect(task(page, 'Bread')).toBeVisible();
	await expect(task(page, 'Milk')).toHaveCount(0);

	// And back again.
	await switcherPill(page).click();
	await dropdown(page).getByRole('option').first().click();

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
	await dropdown(page).getByRole('option').first().click();

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
		return {
			middle: (toast.top + toast.bottom) / 2,
			cornerMiddle: (burger.top + burger.bottom) / 2
		};
	});

	/*
	 * The switcher rides this row too, and neither of them moves the line the
	 * toast stands on. Read middle against middle, because the bar is laid on
	 * the sheet a degree off level (see Toast.svelte) and a top-to-top reading
	 * would be measuring the tilt.
	 */
	expect(Math.abs(where.middle - where.cornerMiddle)).toBeLessThan(8);
});

test('a dropdown row switches with the keyboard, not just a tap', async ({ page }) => {
	await addTask(page, 'Bread');
	await newList(page);
	await addTask(page, 'Milk');

	await switcherPill(page).click();
	await dropdown(page).getByRole('option').first().focus();
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
	// Three lists, and the two this is not.
	await expect(dropdown(page).getByRole('option')).toHaveCount(2);
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

test('the sheet’s own pill opens the same column the menu does', async ({ page }) => {
	await addTask(page, 'Bread');
	await newList(page);

	/*
	 * It used to open a full-screen Modal here and a small column in the menu,
	 * which is two answers to one question — and a modal is for something that
	 * has to be settled before anything else happens, where choosing which list
	 * you are on is a glance at four names.
	 */
	await switcherPill(page).click();
	await expect(dropdown(page)).toBeVisible();
	await expect(page.getByRole('dialog')).toHaveCount(0);

	// Nothing covers the sheet: the list it opened over is still there.
	await expect(page.getByRole('button', { name: 'Add a task' }).first()).toBeVisible();

	// Escape closes it, the same as every other thing that opens in this app.
	await page.keyboard.press('Escape');
	await expect(dropdown(page)).toHaveCount(0);

	// And so does a tap anywhere off it.
	await switcherPill(page).click();
	await expect(dropdown(page)).toBeVisible();
	await page.locator('main').click({ position: { x: 10, y: 300 } });
	await expect(dropdown(page)).toHaveCount(0);
});

test('the switcher is the same row on both sides of the paper', async ({ page }) => {
	await addTask(page, 'Bread');
	await newList(page);
	await addTask(page, 'Milk');

	/*
	 * The name of the list first, where the writing starts, and the marks at
	 * the far end — sync and the burger on the sheet, the theme and the ✕ on
	 * the back. Same shape, same widths, so turning the paper over does not
	 * move the one thing in the row made of words.
	 */
	const front = (await switcherPill(page).boundingBox())!;
	const burger = (await page.getByRole('button', { name: /^Menu/ }).boundingBox())!;
	const writing = (await page.locator('section[data-group] .title').first().boundingBox())!;

	expect(front.x).toBeCloseTo(writing.x, 0);
	expect(front.x + front.width).toBeLessThanOrEqual(burger.x);

	await openMenu(page);
	const dialog = page.getByRole('dialog', { name: 'Menu' });
	const back = (await dialog.locator('button[aria-haspopup="listbox"]').boundingBox())!;
	const theme = (await dialog.getByRole('button', { name: /^Theme/ }).boundingBox())!;
	const close = (await dialog.getByRole('button', { name: 'Close' }).boundingBox())!;

	expect(back.x).toBeCloseTo(front.x, 0);
	expect(back.width).toBeCloseTo(front.width, 0);

	// The thin mark between the name and the corner control, on this face too.
	expect(theme.x).toBeGreaterThanOrEqual(back.x + back.width);
	expect(theme.x + theme.width).toBeLessThanOrEqual(close.x + 1);
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
	await dropdown(page).getByRole('option').first().click();

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
 * Carrying a whole group off the list it is on.
 *
 * A group in hand is the one time the corner has anything to say to it, so the
 * theme and the burger leave, the paper's corner turns down, and the switcher
 * unfolds into the lists the group could go to instead. Three places to let
 * go, and all three leave the ten-second undo everything else here does.
 */

/** Long enough to pick a group up: the title's press has two lengths in it. */
const CARRY_MS = 1100;

async function addGroup(page: Page, name: string, index: number) {
	await page.keyboard.press('Escape');
	await page.getByRole('button', { name: 'Add a group' }).click();

	const field = page.getByRole('textbox', { name: 'New group' });
	await field.fill(name);
	await field.press('Enter');
	await addTask(page, `${name} thing`, index);
}

/** Press the title, hold past both thresholds, and stay still while it lifts. */
async function liftGroup(page: Page, name: string) {
	const box = (await page.getByRole('button', { name, exact: true }).boundingBox())!;
	await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
	await page.mouse.down();
	await page.waitForTimeout(CARRY_MS);
}

/** Carry it over something, without letting go. */
async function carryTo(page: Page, target: string, at?: { dx: number; dy: number }) {
	const box = (await page.locator(target).first().boundingBox())!;
	const point = at ?? { dx: box.width / 2, dy: box.height / 2 };

	await page.mouse.move(box.x + point.dx, box.y + point.dy, { steps: 10 });
}

/** Carry it to a target and let go there. */
async function dropOn(page: Page, target: string, at?: { dx: number; dy: number }) {
	await carryTo(page, target, at);
	await page.mouse.up();
}

/**
 * The lists are not shown until the group reaches the switcher, so getting to
 * one is two movements: onto the pill, which unfolds it, and then onto a row.
 */
function pill(page: Page) {
	return page.locator('button[aria-haspopup="listbox"]');
}

/** Well inside the flap, which is the half of the corner past the crease. */
const ON_THE_FOLD = { dx: 60, dy: 12 };

function titles(page: Page) {
	return page
		.locator('section[data-group] .title')
		.evaluateAll((all) => all.map((title) => title.textContent!.trim()));
}

function undo(page: Page) {
	return page.getByRole('button', { name: 'UNDO?' }).click();
}

test('while a group is carried the corner answers for it', async ({ page }) => {
	await addTask(page, 'Bread');
	await addGroup(page, 'Market', 1);

	await expect(page.getByRole('button', { name: 'Menu' })).toBeVisible();
	await expect(page.locator('[data-fold]')).toHaveCount(0);

	await liftGroup(page, 'Market');

	// The burger has nothing to say to a group in hand, so it goes — with no
	// animation to sit through — and the corner is turned down in its place.
	await expect(page.getByRole('button', { name: 'Menu' })).toHaveCount(0);
	await expect(page.locator('[data-fold]')).toHaveCount(1);

	// And the switcher is on the page even at one list, because the way to a
	// second one is to carry a group onto it — but the lists themselves are
	// not, or the column would lie across the sheet the group is crossing.
	await expect(pill(page)).toBeVisible();
	await expect(page.locator('[data-newlist]')).toHaveCount(0);

	// They open when the group arrives, and shut again when it leaves.
	await carryTo(page, 'button[aria-haspopup="listbox"]');
	await expect(page.locator('[data-newlist]')).toHaveCount(1);

	/*
	 * Back onto the sheet, and well down it: the column is as wide as the
	 * writing now, so it lies over the first group's own title while it is
	 * open — and the hit test reads the pill and the column as one box, which
	 * is what keeps a finger from falling out of the switcher on the way into
	 * the lists. Somewhere below the column is what "back to the sheet" means.
	 */
	await carryTo(page, '[data-newgroup]');
	await expect(page.locator('[data-newlist]')).toHaveCount(0);

	await page.mouse.up();

	await expect(page.getByRole('button', { name: 'Menu' })).toBeVisible();
	await expect(page.locator('[data-fold]')).toHaveCount(0);
});

test('a group let go on the fold is removed, tasks and all, with an undo', async ({ page }) => {
	await addTask(page, 'Bread');
	await addGroup(page, 'Market', 1);

	await liftGroup(page, 'Market');
	await dropOn(page, '[data-fold]', ON_THE_FOLD);

	// It counts what went, done or not — the header's own mark is only ever
	// drawn on a group with nothing left to do, and this one had something.
	await expect(page.getByRole('status').last()).toContainText('Deleted “Market” and 1 task.');
	expect(await titles(page)).toStrictEqual(['My list']);

	/*
	 * And nothing else answered the release. The title the press began on is
	 * deleted by this drop, and the corner buttons come back the instant the
	 * group is out of hand — so the click that follows has both a target that
	 * no longer exists and a burger sitting exactly where the finger is.
	 */
	await expect(page.getByRole('dialog')).toHaveCount(0);

	await undo(page);
	expect(await titles(page)).toStrictEqual(['My list', 'Market']);
	await expect(task(page, 'Market thing')).toBeVisible();

	await page.reload();
	expect(await titles(page)).toStrictEqual(['My list', 'Market']);
});

test('a group carried onto NEW LIST makes one, and goes to it', async ({ page }) => {
	await addTask(page, 'Bread');
	await addGroup(page, 'Market', 1);

	await liftGroup(page, 'Market');
	await carryTo(page, 'button[aria-haspopup="listbox"]');
	await dropOn(page, '[data-newlist]');

	await expect(page.getByRole('status').last()).toContainText('Moved to a new list.');
	expect(await titles(page)).toStrictEqual(['My list']);

	// Two lists now, so the pill has earned its place — and the new one is
	// named after the group that made it, a list's name being its first
	// group's title.
	await expect(switcherPill(page)).toBeVisible();
	await switcherPill(page).click();
	await dropdown(page)
		.getByRole('option', { name: /Market/i })
		.click();

	expect(await titles(page)).toStrictEqual(['Market']);
	await expect(task(page, 'Market thing')).toBeVisible();

	// Nothing was left behind on the way: the task is on the new list and
	// nowhere else.
	await page.reload();
	await expect(task(page, 'Market thing')).toBeVisible();
});

test('undoing a move to a new list unmakes the list it invented', async ({ page }) => {
	await addTask(page, 'Bread');
	await addGroup(page, 'Market', 1);

	await liftGroup(page, 'Market');
	await carryTo(page, 'button[aria-haspopup="listbox"]');
	await dropOn(page, '[data-newlist]');
	await undo(page);

	// Back where it was, with what was in it.
	expect(await titles(page)).toStrictEqual(['My list', 'Market']);
	await expect(task(page, 'Market thing')).toBeVisible();

	// And the list the drop made is gone with the drop, which puts the device
	// back to the exact shape it had: one list, no index.
	await expect(switcherPill(page)).toHaveCount(0);
	const keys = await page.evaluate(() => Object.keys(localStorage));
	expect(keys.filter((key) => key.startsWith('consumma:lists'))).toStrictEqual([]);
});

test('a group carried onto another list moves there, and the undo leaves both', async ({
	page
}) => {
	await addTask(page, 'Bread');
	await newList(page);

	// A second list with a name of its own, so the message can be read.
	await addTask(page, 'Milk');
	await page.locator('section[data-group] .title').first().dblclick();
	const field = page.getByRole('textbox', { name: 'Group title' });
	await field.fill('Larder');
	await field.press('Enter');

	// Back to the first, and a group on it to carry.
	await switcherPill(page).click();
	await dropdown(page)
		.getByRole('option', { name: /My list/i })
		.click();
	await addGroup(page, 'Market', 1);

	await liftGroup(page, 'Market');
	await carryTo(page, 'button[aria-haspopup="listbox"]');
	await dropOn(page, '[data-list]');

	await expect(page.getByRole('status').last()).toContainText('Moved to “Larder”.');
	expect(await titles(page)).toStrictEqual(['My list']);

	await undo(page);

	// Back here, whole — and the list it went to is still there, with only
	// what it always had on it.
	expect(await titles(page)).toStrictEqual(['My list', 'Market']);
	await expect(task(page, 'Market thing')).toBeVisible();

	await switcherPill(page).click();
	await dropdown(page)
		.getByRole('option', { name: /Larder/i })
		.click();
	expect(await titles(page)).toStrictEqual(['Larder']);
	await expect(task(page, 'Milk')).toBeVisible();
});
