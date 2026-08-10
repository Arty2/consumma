import { expect, test, type Page } from '@playwright/test';
import { fromMenu } from './menu';

/*
 * M1's acceptance: add, edit, reorder, tri-state, group, collapse and delete
 * all work, and a reload preserves everything.
 */

async function addTask(page: Page, text: string, groupIndex = 0) {
	// Committing leaves the row open for the next one, so close any that is
	// already open before picking the group to add to.
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

test.beforeEach(async ({ page }) => {
	await page.goto('/');
	await page.evaluate(() => localStorage.clear());
	await page.reload();
});

test('a fresh sheet is one named group, one empty box, and an ellipsis', async ({ page }) => {
	// Displayed in caps, stored in sentence case — the uppercase is CSS only.
	const title = page.getByRole('button', { name: 'My list' });
	await expect(title).toBeVisible();
	await expect(title).toHaveCSS('text-transform', 'uppercase');
	expect(await title.innerText()).toBe('MY LIST');

	await expect(page.getByRole('button', { name: 'Add a task' })).toHaveCount(1);
	await expect(page.getByRole('button', { name: 'Add a group' })).toBeVisible();
	await expect(page.getByRole('checkbox')).toHaveCount(0);
});

test('a title being typed looks like the title it becomes', async ({ page }) => {
	await page.getByRole('button', { name: 'My list' }).dblclick();

	const input = page.getByRole('textbox', { name: 'Group title' });
	await expect(input).toBeVisible();

	const title = page.getByRole('button', { name: 'Add a group' });
	const face = await title.evaluate((el) => getComputedStyle(el).fontFamily);

	await expect(input).toHaveCSS('text-transform', 'uppercase');
	await expect(input).toHaveCSS('font-family', face);

	// And what is stored keeps the casing that was typed.
	await input.fill('Weekend jobs');
	await input.press('Enter');

	const renamed = page.getByRole('button', { name: 'Weekend jobs' });
	expect(await renamed.innerText()).toBe('WEEKEND JOBS');
});

test('the new-group placeholder lines up with the group titles', async ({ page }) => {
	const title = await page.getByRole('button', { name: 'My list' }).boundingBox();
	const placeholder = await page.getByRole('button', { name: 'Add a group' }).boundingBox();

	// Same left edge: it is the same thing, one step earlier.
	expect(placeholder!.x).toBeCloseTo(title!.x, 0);
});

test('committing leaves a fresh empty box beneath, so a burst is just typing', async ({ page }) => {
	await page.getByRole('button', { name: 'Add a task' }).click();

	const input = page.getByRole('textbox', { name: 'New task' });
	await input.fill('Bread');
	await input.press('Enter');

	// Still open, still focused, and emptied ready for the next one.
	await expect(input).toBeFocused();
	await expect(input).toHaveValue('');

	await input.fill('Coffee');
	await input.press('Enter');

	await expect(task(page, 'Bread')).toBeVisible();
	await expect(task(page, 'Coffee')).toBeVisible();
});

test('adds tasks in a burst and keeps them across a reload', async ({ page }) => {
	await addTask(page, 'Bread');
	await addTask(page, 'Coffee, the dark one');

	await expect(task(page, 'Bread')).toBeVisible();
	await expect(task(page, 'Coffee, the dark one')).toBeVisible();

	await page.reload();

	await expect(task(page, 'Bread')).toBeVisible();
	await expect(task(page, 'Coffee, the dark one')).toBeVisible();
});

test('a tap toggles to-do and done, and the state survives a reload', async ({ page }) => {
	await addTask(page, 'Bread');

	await expect(task(page, 'Bread')).toHaveAttribute('aria-checked', 'false');

	await task(page, 'Bread').click();
	await expect(task(page, 'Bread')).toHaveAttribute('aria-checked', 'true');

	await page.reload();
	await expect(task(page, 'Bread')).toHaveAttribute('aria-checked', 'true');

	await task(page, 'Bread').click();
	await expect(task(page, 'Bread')).toHaveAttribute('aria-checked', 'false');
});

test('shift+space sets the half state, which reports as mixed', async ({ page }) => {
	await addTask(page, 'Bread');

	await task(page, 'Bread').focus();
	await page.keyboard.press('Shift+ ');

	await expect(task(page, 'Bread')).toHaveAttribute('aria-checked', 'mixed');

	// Half done again returns it to to-do.
	await page.keyboard.press('Shift+ ');
	await expect(task(page, 'Bread')).toHaveAttribute('aria-checked', 'false');
});

test('a long press on the checkbox sets half without a keyboard', async ({ page }) => {
	await addTask(page, 'Bread');

	const box = task(page, 'Bread');
	const at = await box.boundingBox();
	if (!at) throw new Error('no checkbox');

	await page.mouse.move(at.x + at.width / 2, at.y + at.height / 2);
	await page.mouse.down();
	await page.waitForTimeout(700);
	await page.mouse.up();

	await expect(box).toHaveAttribute('aria-checked', 'mixed');
});

test('edits a task in place', async ({ page }) => {
	await addTask(page, 'Bread');

	await page.getByRole('button', { name: 'Bread', exact: true }).dblclick();
	const input = page.getByRole('textbox').first();
	await input.fill('Sourdough');
	await input.press('Enter');

	await expect(task(page, 'Sourdough')).toBeVisible();
	await page.reload();
	await expect(task(page, 'Sourdough')).toBeVisible();
});

test('deletes a task and offers it back', async ({ page }) => {
	await addTask(page, 'Bread');
	await addTask(page, 'Coffee');

	// Only a done task offers a way out, so finish it before removing it.
	await task(page, 'Bread').click();
	await page.getByRole('button', { name: 'Delete task' }).first().click();

	await expect(task(page, 'Bread')).toHaveCount(0);

	await page.getByRole('button', { name: 'UNDO?' }).click();
	await expect(task(page, 'Bread')).toBeVisible();

	await page.reload();
	await expect(task(page, 'Bread')).toBeVisible();
});

test('CLEAR sweeps done tasks only, and half-done stays', async ({ page }) => {
	await addTask(page, 'Bread');
	await addTask(page, 'Coffee');
	await addTask(page, 'Milk');

	await task(page, 'Bread').click();

	await task(page, 'Coffee').focus();
	await page.keyboard.press('Shift+ ');

	await fromMenu(page, 'Clear');
	await page.getByRole('button', { name: 'Clear', exact: true }).click();

	await expect(task(page, 'Bread')).toHaveCount(0);
	await expect(task(page, 'Coffee')).toBeVisible();
	await expect(task(page, 'Milk')).toBeVisible();

	await page.getByRole('button', { name: 'UNDO?' }).click();
	await expect(task(page, 'Bread')).toBeVisible();
});

test('makes a group, collapses it, and remembers that locally', async ({ page }) => {
	await page.getByRole('button', { name: 'Add a group' }).click();
	const title = page.getByRole('textbox', { name: 'New group' });
	await title.fill('Market');
	await title.press('Enter');

	await expect(page.getByRole('button', { name: 'Market' })).toBeVisible();

	await addTask(page, 'Bread', 1);
	await expect(task(page, 'Bread')).toBeVisible();

	// The icon collapses; the title is for renaming and does not toggle.
	await page.getByRole('button', { name: 'Collapse group' }).nth(1).click();
	await expect(task(page, 'Bread')).toHaveCount(0);
	// The count is in the header control, and nowhere else on the row.
	await expect(page.getByRole('button', { name: 'Expand group' })).toHaveText('[1]');

	await page.reload();
	await expect(page.getByRole('button', { name: 'Expand group' })).toHaveText('[1]');

	await page.getByRole('button', { name: 'Expand group' }).click();
	await expect(task(page, 'Bread')).toBeVisible();
});

test('moves a task with the keyboard and announces where it went', async ({ page }) => {
	await addTask(page, 'Bread');
	await addTask(page, 'Coffee');

	const order = () =>
		page
			.getByRole('checkbox')
			.evaluateAll((boxes) => boxes.map((b) => b.getAttribute('aria-label')));

	expect(await order()).toStrictEqual(['Bread', 'Coffee']);

	await task(page, 'Bread').focus();
	await page.keyboard.press('Alt+ArrowDown');

	expect(await order()).toStrictEqual(['Coffee', 'Bread']);
	await expect(page.getByRole('status').first()).toContainText('Moved to position 2');

	await page.reload();
	expect(await order()).toStrictEqual(['Coffee', 'Bread']);
});

test('Consummatum appears when the last open task is ticked, and not on an empty sheet', async ({
	page
}) => {
	await expect(page.getByText('Consummatum')).toHaveCount(0);

	await addTask(page, 'Bread');
	await addTask(page, 'Coffee');

	await task(page, 'Bread').click();
	await expect(page.getByText('Consummatum')).toHaveCount(0);

	await task(page, 'Coffee').click();
	await expect(page.getByText('Consummatum')).toBeVisible();
});

test('the header control collapses and expands, and counts what it hides', async ({ page }) => {
	await addTask(page, 'Bread');
	await addTask(page, 'Milk');

	// Expanded it offers to close, and says nothing about how much is there —
	// the tasks are on screen to be counted.
	const collapse = page.getByRole('button', { name: 'Collapse group' });
	await expect(collapse).toHaveAttribute('aria-expanded', 'true');
	await expect(collapse).toHaveText('[…]');

	await collapse.click();
	await expect(page.getByRole('checkbox', { name: 'Bread' })).toHaveCount(0);

	// Closed, the number is the only account of what went away.
	const expand = page.getByRole('button', { name: 'Expand group' });
	await expect(expand).toHaveAttribute('aria-expanded', 'false');
	await expect(expand).toHaveText('[2]');

	await expand.click();
	await expect(page.getByRole('checkbox', { name: 'Bread' })).toBeVisible();
});

test('the ghost checkbox opens the row it sits on', async ({ page }) => {
	/*
	 * It is an empty box in a 44px target beside a row that opens on a tap.
	 * Leaving it inert made half the control dead, and which half was invisible.
	 */
	const ghost = page.locator('button.box').first();
	await ghost.click();

	const input = page.getByRole('textbox', { name: 'New task' });
	await expect(input).toBeFocused();

	// And it really is the add row, not just a focused field.
	await input.fill('Bread');
	await input.press('Enter');
	await expect(task(page, 'Bread')).toBeVisible();
});

test('a done task offers its own way out, and the way back', async ({ page }) => {
	await addTask(page, 'Bread');
	await addTask(page, 'Milk');

	/*
	 * Nothing to remove until something is done — no hover exists on a phone.
	 * The pointer has to be moved off first: adding tasks pushes the add row
	 * down, so it ends up resting on a task row, and the ✕ answers a hover.
	 */
	await page.mouse.move(0, 0);
	await expect(page.getByRole('button', { name: 'Delete task' })).toHaveCount(0);

	await page.getByRole('checkbox', { name: 'Bread' }).click();
	const remove = page.getByRole('button', { name: 'Delete task' });
	await expect(remove).toHaveCount(1);

	await remove.click();
	await expect(page.getByRole('checkbox', { name: 'Bread' })).toHaveCount(0);

	// Deleting is local and immediate, so the way back is the toast.
	const toast = page.getByRole('status').filter({ hasText: /deleted/i });
	await expect(toast).toBeVisible();
	// Everything the sheet says is set in capitals.
	await expect(toast.locator('span').first()).toHaveCSS('text-transform', 'uppercase');

	await toast.getByRole('button', { name: 'Undo?' }).click();
	await expect(page.getByRole('checkbox', { name: 'Bread' })).toBeVisible();
});

test('the title renames, the icon collapses, and neither does the other', async ({ page }) => {
	await addTask(page, 'Bread');

	/*
	 * They used to share the title: a tap collapsed and a double tap renamed, so
	 * every rename began by collapsing the group and every collapse was one slip
	 * away from an edit box.
	 */
	await page.getByRole('button', { name: 'My list' }).dblclick();
	const field = page.getByRole('textbox', { name: 'Group title' });
	await expect(field).toBeFocused();

	// Editing did not collapse anything.
	await expect(task(page, 'Bread')).toBeVisible();

	await field.fill('Market');
	await field.press('Enter');
	await expect(page.getByRole('button', { name: 'Market' })).toBeVisible();

	// And the icon collapses without opening the name.
	await page.getByRole('button', { name: 'Collapse group' }).click();
	await expect(task(page, 'Bread')).toHaveCount(0);
	await expect(page.getByRole('textbox', { name: 'Group title' })).toHaveCount(0);
});

test('a group can be removed only once nothing in it is left to do', async ({ page }) => {
	await addTask(page, 'Bread');
	await addTask(page, 'Milk');

	// Editing the name is where the way out lives, in the icon's place.
	await page.getByRole('button', { name: 'My list' }).dblclick();
	const remove = page.getByRole('button', { name: /^Delete group/ });

	// Two tasks open, so it is drawn but not offered.
	await expect(remove).toBeDisabled();
	await expect(remove).toHaveAttribute('aria-label', /finish its tasks first/i);
	await page.keyboard.press('Escape');

	await task(page, 'Bread').click();
	await page.getByRole('button', { name: 'My list' }).dblclick();
	// One still open: still refused.
	await expect(page.getByRole('button', { name: /^Delete group/ })).toBeDisabled();
	await page.keyboard.press('Escape');

	await task(page, 'Milk').click();
	await page.getByRole('button', { name: 'My list' }).dblclick();

	const ready = page.getByRole('button', { name: 'Delete group' });
	await expect(ready).toBeEnabled();
	await ready.click();

	// The group and everything in it, and a toast that says how much went.
	await expect(page.getByRole('button', { name: 'My list' })).toHaveCount(0);
	await expect(page.getByRole('status').filter({ hasText: /Removed/ })).toBeVisible();
});

test('a long press on a group title picks the whole group up', async ({ page }) => {
	await addTask(page, 'Bread');

	await page.getByRole('button', { name: 'Add a group' }).click();
	const name = page.getByRole('textbox', { name: 'New group' });
	await name.fill('Market');
	await name.press('Enter');
	await addTask(page, 'Milk', 1);

	const order = () =>
		page
			.locator('section[data-group] .title')
			.evaluateAll((titles) => titles.map((t) => t.textContent!.trim()));

	expect(await order()).toStrictEqual(['My list', 'Market']);

	// Held, not tapped: a tap would open the name for editing.
	const title = page.getByRole('button', { name: 'Market' });
	const from = (await title.boundingBox())!;
	const to = (await page.getByRole('button', { name: 'My list' }).boundingBox())!;

	await page.mouse.move(from.x + from.width / 2, from.y + from.height / 2);
	await page.mouse.down();
	await page.waitForTimeout(600);

	// The lift is a dashed outline and a tilt, as it is for a task.
	await expect(page.locator('section[data-group] .header svg.rect path')).toHaveCount(1);

	await page.mouse.move(to.x + to.width / 2, to.y + 2, { steps: 12 });
	await page.mouse.up();

	expect(await order()).toStrictEqual(['Market', 'My list']);
	await page.reload();
	expect(await order()).toStrictEqual(['Market', 'My list']);
});

test('dropping a task does not open it for editing', async ({ page }) => {
	/*
	 * The release after a drag still fires a click, and the thing being held is
	 * a button — so every drop landed the row in an edit box. It was there
	 * before groups could be dragged; the group drag is what made it obvious.
	 */
	await addTask(page, 'Bread');
	await addTask(page, 'Coffee');

	const row = page.getByRole('button', { name: 'Coffee', exact: true });
	const from = (await row.boundingBox())!;
	const to = (await page.getByRole('button', { name: 'Bread', exact: true }).boundingBox())!;

	await page.mouse.move(from.x + from.width / 2, from.y + from.height / 2);
	await page.mouse.down();
	await page.waitForTimeout(600);
	await page.mouse.move(to.x + to.width / 2, to.y + 2, { steps: 12 });
	await page.mouse.up();

	await expect(page.getByRole('textbox')).toHaveCount(0);

	const order = () =>
		page
			.getByRole('checkbox')
			.evaluateAll((boxes) => boxes.map((b) => b.getAttribute('aria-label')));
	expect(await order()).toStrictEqual(['Coffee', 'Bread']);
});

test('Enter on a task opens a fresh one directly beneath it', async ({ page }) => {
	await addTask(page, 'Bread');
	await addTask(page, 'Milk');

	const order = () =>
		page
			.getByRole('checkbox')
			.evaluateAll((boxes) => boxes.map((b) => b.getAttribute('aria-label')));

	// Editing the first one and pressing Enter leaves it and opens a row below.
	await page.getByRole('button', { name: 'Bread', exact: true }).dblclick();
	// The edit field is the only textbox on the sheet while it is open.
	await page.getByRole('textbox').first().press('Enter');

	const fresh = page.getByRole('textbox', { name: 'New task' });
	await expect(fresh).toBeFocused();

	await fresh.fill('Butter');
	await fresh.press('Enter');

	// Between the two, not on the end — and the next one carries on below it.
	expect(await order()).toStrictEqual(['Bread', 'Butter', 'Milk']);

	await fresh.fill('Jam');
	await fresh.press('Enter');
	expect(await order()).toStrictEqual(['Bread', 'Butter', 'Jam', 'Milk']);

	await page.keyboard.press('Escape');
	await page.reload();
	expect(await order()).toStrictEqual(['Bread', 'Butter', 'Jam', 'Milk']);
});

test('tapping a task takes the caret with it, to the end of what it says', async ({ page }) => {
	/*
	 * The field used to be swapped in unfocused, which meant it never blurred,
	 * so the row never committed and never came out of edit mode — it simply sat
	 * there showing the raw string. On a task with a count and a price in it,
	 * that reads exactly like the two being lost.
	 */
	await addTask(page, '2x Tomatos 5,08');
	await page.getByRole('button', { name: '2x Tomatos 5,08', exact: true }).dblclick();

	const field = page.getByRole('textbox').first();
	await expect(field).toBeFocused();
	// At the end, so typing adds to what is there rather than landing mid-word.
	expect(await field.evaluate((el: HTMLInputElement) => el.selectionStart)).toBe(15);

	// And because it can blur, it commits, and the row goes back to being read.
	await page.keyboard.press('Escape');
	await expect(page.locator('.tasks li .cost').first()).toHaveText('5,08');

	// The same on a task that is done — where this was first noticed.
	await task(page, '2x Tomatos 5,08').click();
	await page.getByRole('button', { name: '2x Tomatos 5,08', exact: true }).dblclick();
	await expect(page.getByRole('textbox').first()).toBeFocused();
});

test('Backspace on an empty row takes the caret back to the one above', async ({ page }) => {
	await addTask(page, 'Bread');
	await addTask(page, 'Milk');

	const order = () =>
		page
			.getByRole('checkbox')
			.evaluateAll((boxes) => boxes.map((b) => b.getAttribute('aria-label')));

	// Enter opens a fresh row; backspace on it closes it again and goes back.
	await page.getByRole('button', { name: 'Bread', exact: true }).dblclick();
	await page.getByRole('textbox').first().press('Enter');
	await expect(page.getByRole('textbox', { name: 'New task' })).toBeFocused();

	await page.keyboard.press('Backspace');
	const field = page.getByRole('textbox').first();
	await expect(field).toBeFocused();
	await expect(field).toHaveValue('Bread');
	// With the caret at the end of it, so typing carries on where it left off.
	expect(await field.evaluate((el: HTMLInputElement) => el.selectionStart)).toBe(5);

	// Nothing was created and nothing was lost.
	expect(await order()).toStrictEqual(['Bread', 'Milk']);
});

test('Escape discards an edit rather than committing it', async ({ page }) => {
	/*
	 * It could not be told apart while the field was never focused: nothing was
	 * typed into it, so nothing was there to keep. Now that the caret goes with
	 * the tap, taking the field out of the document blurs it — and a blur
	 * commits, which would make Escape a slower Enter.
	 */
	await addTask(page, 'Bread');

	await page.getByRole('button', { name: 'Bread', exact: true }).dblclick();
	const field = page.getByRole('textbox').first();
	await field.fill('Sourdough');
	await field.press('Escape');

	await expect(task(page, 'Bread')).toBeVisible();
	await expect(task(page, 'Sourdough')).toHaveCount(0);

	// The same on a group title.
	await page.getByRole('button', { name: 'My list' }).dblclick();
	const title = page.getByRole('textbox', { name: 'Group title' });
	await title.fill('Market');
	await title.press('Escape');

	await expect(page.getByRole('button', { name: 'My list' })).toBeVisible();
	await expect(page.getByRole('button', { name: 'Market' })).toHaveCount(0);
});

test('Backspace on a task emptied of its words deletes it, and offers it back', async ({
	page
}) => {
	await addTask(page, 'Bread');
	await addTask(page, 'Milk');

	const order = () =>
		page
			.getByRole('checkbox')
			.evaluateAll((boxes) => boxes.map((b) => b.getAttribute('aria-label')));

	await page.getByRole('button', { name: 'Milk', exact: true }).dblclick();
	const field = page.getByRole('textbox').first();
	await field.fill('');
	await field.press('Backspace');

	// Gone, and the caret is at the end of the task above it.
	expect(await order()).toStrictEqual(['Bread']);
	await expect(page.getByRole('textbox').first()).toHaveValue('Bread');

	// It goes through the ordinary delete, so the ordinary undo covers it.
	await page
		.getByRole('status')
		.filter({ hasText: /deleted/i })
		.getByRole('button', { name: 'Undo?' })
		.click();
	expect(await order()).toStrictEqual(['Bread', 'Milk']);
});

test('Backspace on the first task in a group deletes nothing', async ({ page }) => {
	await addTask(page, 'Bread');

	await page.getByRole('button', { name: 'Bread', exact: true }).dblclick();
	const field = page.getByRole('textbox').first();
	await field.fill('');
	await field.press('Backspace');

	// There is nowhere above for the caret to go, so the task stays.
	await expect(task(page, 'Bread')).toBeVisible();
});

test('Enter on a group title opens a task inside the group', async ({ page }) => {
	await addTask(page, 'Bread');

	await page.getByRole('button', { name: 'My list' }).dblclick();
	const title = page.getByRole('textbox', { name: 'Group title' });
	await title.fill('Market');
	await title.press('Enter');

	// The name is committed, and the caret has moved into a task at the top.
	await expect(page.getByRole('button', { name: 'Market' })).toBeVisible();

	const fresh = page.getByRole('textbox', { name: 'New task' });
	await expect(fresh).toBeFocused();
	await fresh.fill('Milk');
	await fresh.press('Enter');
	await page.keyboard.press('Escape');

	const order = () =>
		page
			.getByRole('checkbox')
			.evaluateAll((boxes) => boxes.map((b) => b.getAttribute('aria-label')));
	expect(await order()).toStrictEqual(['Milk', 'Bread']);
});

test('a double tap sets half, and a single one still just ticks', async ({ page }) => {
	await addTask(page, 'Bread');
	const box = task(page, 'Bread');

	// One tap is a tick, and stays one.
	await box.click();
	await expect(box).toHaveAttribute('aria-checked', 'true');
	await page.waitForTimeout(400);

	await box.click();
	await expect(box).toHaveAttribute('aria-checked', 'false');
	await page.waitForTimeout(400);

	// Two inside the window land on half, whatever the first one did.
	await box.dblclick();
	await expect(box).toHaveAttribute('aria-checked', 'mixed');

	await page.reload();
	await expect(task(page, 'Bread')).toHaveAttribute('aria-checked', 'mixed');
});

test('removing a group offers it back, with everything that was in it', async ({ page }) => {
	await addTask(page, 'Bread');
	await addTask(page, 'Milk');
	await task(page, 'Bread').click();
	await task(page, 'Milk').click();

	await page.getByRole('button', { name: 'My list' }).dblclick();
	await page.getByRole('button', { name: 'Delete group' }).click();

	await expect(page.getByRole('button', { name: 'My list' })).toHaveCount(0);
	await expect(page.getByRole('checkbox')).toHaveCount(0);

	await page.getByRole('button', { name: 'UNDO?' }).click();

	// The group, its name, and both tasks — not a pile under Loose ends.
	await expect(page.getByRole('button', { name: 'My list' })).toBeVisible();
	await expect(page.getByRole('checkbox')).toHaveCount(2);
	await expect(page.getByText('Loose ends')).toHaveCount(0);

	await page.reload();
	await expect(page.getByRole('checkbox')).toHaveCount(2);
});

test('carrying a group folds them all shut, and unfolds them after', async ({ page }) => {
	await addTask(page, 'Bread');

	await page.getByRole('button', { name: 'Add a group' }).click();
	const name = page.getByRole('textbox', { name: 'New group' });
	await name.fill('Market');
	await name.press('Enter');
	await addTask(page, 'Milk', 1);

	await expect(page.getByRole('checkbox')).toHaveCount(2);

	const title = page.getByRole('button', { name: 'Market' });
	const from = (await title.boundingBox())!;

	await page.mouse.move(from.x + from.width / 2, from.y + from.height / 2);
	await page.mouse.down();
	await page.waitForTimeout(600);

	/*
	 * Everything folds while one is being carried, so the whole list is a
	 * handful of titles and there is somewhere visible to put it down.
	 */
	await expect(page.getByRole('checkbox')).toHaveCount(0);

	await page.mouse.up();
	await expect(page.getByRole('checkbox')).toHaveCount(2);

	// And nothing about it was written down: the fold was a view of the drag.
	await page.reload();
	await expect(page.getByRole('checkbox')).toHaveCount(2);
});

/**
 * Strands a task under a group that is not in the document, which is the only
 * way Loose ends comes about: a group deleted on another phone, or a list
 * imported with nothing above it.
 */
async function strand(page: Page, ...texts: string[]) {
	await addTask(page, 'Bread');
	await page.evaluate((stray) => {
		const doc = JSON.parse(localStorage.getItem('consumma:doc')!);
		const first = Object.values(doc.tasks)[0] as Record<string, unknown>;

		stray.forEach((text, i) => {
			const task = JSON.parse(JSON.stringify(first));
			task.id = `stranded${i}`;
			task.text = text;
			task.groupId = 'agroupthatisgone';
			doc.tasks[task.id] = task;
		});

		localStorage.setItem('consumma:doc', JSON.stringify(doc));
	}, texts);
	await page.reload();
}

test('what has lost its group is ruled off rather than headed', async ({ page }) => {
	await strand(page, 'Stray');

	/*
	 * Loose ends only ever appears because two phones disagreed. Nothing under
	 * it was put there on purpose, so there is nothing to name, rename, delete,
	 * carry, collapse or add to — and a title row offers every one of those just
	 * by looking like one. A perforation across the paper offers none.
	 */
	const line = page.getByRole('separator', { name: 'Loose ends' });
	await expect(line).toBeVisible();

	// Drawn and dashed, like the landing rule and the paper's own edges.
	const path = line.locator('path');
	await expect(path).toHaveClass(/drawn--dashed/);
	expect(await path.evaluate((el) => getComputedStyle(el).strokeWidth)).toBe(
		await page.evaluate(
			() => getComputedStyle(document.documentElement).getPropertyValue('--stroke').trim() + 'px'
		)
	);

	// Right across the paper, not the width of a word — the rules are not.
	const across = (await line.boundingBox())!.width;
	const sheet = (await page.locator('main').boundingBox())!.width;
	expect(across).toBeCloseTo(sheet, 0);

	// None of the things a heading offers.
	await expect(page.getByRole('button', { name: 'Loose ends' })).toHaveCount(0);
	await expect(page.getByRole('button', { name: 'Add a task' })).toHaveCount(1);
	await expect(page.getByRole('button', { name: /^(Collapse|Expand) group/ })).toHaveCount(1);
	await expect(page.locator('section.group svg.rule')).toHaveCount(1);

	/*
	 * And the way to make a group belongs above the line, among the ones anyone
	 * made. Under it, it would read as a way to name what is already there.
	 */
	const order = await page
		.locator('section.group, .new-group')
		.evaluateAll((els) => els.map((el) => (el.className.includes('new-group') ? 'new' : 'group')));
	expect(order).toStrictEqual(['group', 'new', 'group']);
});

test('a task carried onto the new-group row lands in one that did not exist', async ({ page }) => {
	await addTask(page, 'Bread');
	await addTask(page, 'Olives');
	await expect(page.locator('section.group')).toHaveCount(1);

	const row = page.getByRole('button', { name: 'Olives', exact: true });
	const from = (await row.boundingBox())!;
	const onto = (await page.locator('.new-group').boundingBox())!;

	await page.mouse.move(from.x + 30, from.y + from.height / 2);
	await page.mouse.down();
	// Long enough to lift: a shorter press is a tap and a moved one is a scroll.
	await page.waitForTimeout(600);
	await page.mouse.move(from.x + 30, from.y + 10, { steps: 4 });
	await page.mouse.move(onto.x + 30, onto.y + onto.height / 2, { steps: 12 });

	// The offer is made in the same hand as every other landing. The rule is
	// what shows; its row takes no room, so the row itself has no box at all.
	await expect(page.locator('.landing svg')).toBeVisible();

	await page.mouse.up();

	/*
	 * It arrives unnamed, showing the ellipsis an untitled group always shows.
	 * Carrying a task somewhere new is one decision; being made to name the
	 * place before the finger comes up would be a second.
	 */
	await expect(page.locator('section.group')).toHaveCount(2);
	await expect(page.getByRole('button', { name: 'Untitled group' })).toBeVisible();

	const perGroup = await page
		.locator('section.group')
		.evaluateAll((els) =>
			els.map((el) =>
				[...el.querySelectorAll('[data-task] .text')].map((t) => t.textContent!.trim())
			)
		);
	expect(perGroup).toStrictEqual([['Bread'], ['Olives']]);

	// And it survives being put down.
	await page.reload();
	await expect(page.locator('section.group')).toHaveCount(2);
});

test('the landing rule is drawn in the gap, and never moves the list', async ({ page }) => {
	/*
	 * It used to be five pixels tall and in the flow, so every time the target
	 * changed, every row past it moved five pixels — which is what the jerking
	 * under the finger was. Worse, the rows it moved are the rows the next hit
	 * test reads, so the drag was steering by a ruler it kept nudging.
	 */
	await page.getByRole('button', { name: 'Add a task' }).first().click();
	const input = page.getByRole('textbox', { name: 'New task' });
	for (const text of ['One', 'Two', 'Three', 'Four']) {
		await input.fill(text);
		await input.press('Enter');
	}
	await page.keyboard.press('Escape');

	const tops = () =>
		page
			.locator('[data-task]')
			.evaluateAll((els) => els.map((el) => el.getBoundingClientRect().top));

	// The lifted row tilts, so its own box moves; the rest must not.
	const before = (await tops()).slice(1);

	const row = (await page.getByRole('button', { name: 'One', exact: true }).boundingBox())!;
	await page.mouse.move(row.x + 30, row.y + row.height / 2);
	await page.mouse.down();
	await page.waitForTimeout(600);
	await page.mouse.move(row.x + 30, row.y + 8, { steps: 3 });
	await page.mouse.move(row.x + 30, row.y + 120, { steps: 10 });

	const landing = page.locator('.landing');
	await expect(landing).toHaveCount(1);
	await expect(landing.locator('svg')).toBeVisible();

	// Drawn, but taking no room: the rule sits between two rows, not among them.
	expect(await landing.evaluate((el) => (el as HTMLElement).offsetHeight)).toBe(0);
	expect((await tops()).slice(1)).toStrictEqual(before);

	await page.mouse.up();
});
