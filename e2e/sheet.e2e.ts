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

	await page.getByRole('button', { name: 'Bread', exact: true }).click();
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
	await page.getByRole('button', { name: 'My list' }).click();
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
	await page.getByRole('button', { name: 'My list' }).click();
	const remove = page.getByRole('button', { name: /^Delete group/ });

	// Two tasks open, so it is drawn but not offered.
	await expect(remove).toBeDisabled();
	await expect(remove).toHaveAttribute('aria-label', /finish its tasks first/i);
	await page.keyboard.press('Escape');

	await task(page, 'Bread').click();
	await page.getByRole('button', { name: 'My list' }).click();
	// One still open: still refused.
	await expect(page.getByRole('button', { name: /^Delete group/ })).toBeDisabled();
	await page.keyboard.press('Escape');

	await task(page, 'Milk').click();
	await page.getByRole('button', { name: 'My list' }).click();

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
