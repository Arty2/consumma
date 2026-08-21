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

test('ticking a task to done draws the sparkle flourish, with no toast', async ({ page }) => {
	await addTask(page, 'Bread');
	await addTask(page, 'Coffee');

	await task(page, 'Bread').click();
	await task(page, 'Coffee').click();

	await expect(task(page, 'Coffee').locator('svg.sparkle')).toBeVisible();
	await expect(page.getByRole('status').filter({ hasText: 'Consummatum' })).toHaveCount(0);

	/*
	 * And thrown out from the mark, not from the middle of the target.
	 *
	 * The flourish is centred on the box it is drawn in, and that box reaches a
	 * third again wider than the mark and the whole height of the row — so its
	 * middle is a point out in the words with nothing drawn at it. Centred
	 * there, the sparkle came off a tick that was not where the ink was.
	 */
	const apart = await page.evaluate(() => {
		const row = document.querySelector('.tasks li:has(svg.sparkle)')!;
		const mark = row.querySelector('[role="checkbox"] svg:not(.sparkle)')!.getBoundingClientRect();
		const spark = row.querySelector('svg.sparkle')!.getBoundingClientRect();
		return {
			x: Math.abs(mark.left + mark.width / 2 - (spark.left + spark.width / 2)),
			y: Math.abs(mark.top + mark.height / 2 - (spark.top + spark.height / 2))
		};
	});

	// One point, within the rounding a drawn box costs.
	expect(apart.x).toBeLessThan(1);
	expect(apart.y).toBeLessThan(1);
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

	/*
	 * `expect.poll` rather than `expect(await order())`: reading the rows is a
	 * one-shot evaluate, and a bare expect around one does not retry. The row
	 * commits and the next opens in the same keydown, so the assertion could
	 * land between the two and see the list mid-write — rarely, and only under
	 * enough load to matter, which is exactly what CI is.
	 */
	// Between the two, not on the end — and the next one carries on below it.
	await expect.poll(order).toStrictEqual(['Bread', 'Butter', 'Milk']);

	await fresh.fill('Jam');
	await fresh.press('Enter');
	await expect.poll(order).toStrictEqual(['Bread', 'Butter', 'Jam', 'Milk']);

	await page.keyboard.press('Escape');
	await page.reload();
	await expect.poll(order).toStrictEqual(['Bread', 'Butter', 'Jam', 'Milk']);
});

test('tapping a task takes the caret with it', async ({ page }) => {
	/*
	 * The field used to be swapped in unfocused, which meant it never blurred,
	 * so the row never committed and never came out of edit mode — it simply sat
	 * there showing the raw string. On a task with a count and a price in it,
	 * that reads exactly like the two being lost.
	 */
	await addTask(page, '2x Tomatos 5,08');
	await page.getByRole('button', { name: '2x Tomatos 5,08', exact: true }).click();

	const field = page.getByRole('textbox').first();
	await expect(field).toBeFocused();

	/*
	 * Somewhere in the task, and inside the name rather than at either end of
	 * the string: the row draws `Tomatos` alone in the middle cell, and the
	 * offset has to be carried back past the count to reach the text itself.
	 * Tapped at the end of a word, so the exact character is not at the mercy
	 * of where in a glyph the click landed.
	 */
	const caret = await field.evaluate((el: HTMLTextAreaElement) => el.selectionStart);
	expect(caret).toBeGreaterThan(2);
	expect(caret).toBeLessThanOrEqual(10);

	// And because it can blur, it commits, and the row goes back to being read.
	await page.keyboard.press('Escape');
	await expect(page.locator('.tasks li .cost').first()).toHaveText('5,08');

	/*
	 * The same on a task that is done — where this was first noticed.
	 *
	 * Clear of the tap window first. Two taps on one row inside 320ms are one
	 * run whatever happened between them, and the assertions above run in
	 * rather less than that — so without the wait this second tap climbs the
	 * first one's ladder instead of starting a run of its own.
	 */
	await page.waitForTimeout(450);
	await task(page, '2x Tomatos 5,08').click();
	await page.waitForTimeout(450);
	await page.getByRole('button', { name: '2x Tomatos 5,08', exact: true }).click();
	await expect(page.getByRole('textbox').first()).toBeFocused();
});

test('the caret lands where the finger did, not at the end', async ({ page }) => {
	const long = 'Bread and butter and jam and cheese and everything else besides';
	await addTask(page, long);

	const words = page.getByRole('button', { name: long, exact: true });
	const box = (await words.boundingBox())!;

	// A quarter of the way along the first line, which is nowhere near either end.
	await page.mouse.click(box.x + box.width * 0.25, box.y + 12);

	const field = page.getByRole('textbox').first();
	await expect(field).toBeFocused();

	const caret = await field.evaluate((el: HTMLTextAreaElement) => el.selectionStart);
	expect(caret).toBeGreaterThan(2);
	expect(caret).toBeLessThan(long.length - 4);
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
	// The real group still carries its drawn underline; the perforation above
	// has nothing analogous, being a line rather than a title.
	expect(
		await page
			.locator('section.group .title')
			.evaluate((el) => getComputedStyle(el).backgroundImage)
	).not.toBe('none');

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

test('the phone answers back, and says different things for different acts', async ({ page }) => {
	/*
	 * `navigator.vibrate` is absent on desktop and refused outright by iOS
	 * Safari, so nothing about this can be seen by looking at the app. Stubbed
	 * and counted, because a confirmation nobody ever checks is a confirmation
	 * that quietly stopped working.
	 */
	await page.addInitScript(() => {
		(window as unknown as { buzzes: (number | number[])[] }).buzzes = [];
		Object.defineProperty(navigator, 'vibrate', {
			value: (pattern: number | number[]) => {
				(window as unknown as { buzzes: (number | number[])[] }).buzzes.push(pattern);
				return true;
			},
			configurable: true
		});
	});
	await page.reload();

	const buzzes = () =>
		page.evaluate(() => (window as unknown as { buzzes: (number | number[])[] }).buzzes);
	const clear = () =>
		page.evaluate(() => ((window as unknown as { buzzes: (number | number[])[] }).buzzes = []));

	await addTask(page, 'Bread');

	// A tick is something finished: dot dot dash.
	await clear();
	await task(page, 'Bread').click();
	expect(await buzzes()).toStrictEqual([[10, 50, 10, 50, 45]]);

	// A delete is something taken away: dot dot.
	await clear();
	await page.getByRole('button', { name: 'Delete task' }).first().click();
	expect(await buzzes()).toStrictEqual([[10, 60, 10]]);

	// And a button is a thing done: one tap.
	await clear();
	await page.getByRole('button', { name: 'Menu' }).click();
	expect(await buzzes()).toStrictEqual([10]);
});

test('a message comes down from above and can be thrown back out', async ({ page }) => {
	/*
	 * It used to appear and disappear outright, which is the one thing on the
	 * sheet that happened rather than moved — and a message that blinks out is
	 * one you are never sure you saw.
	 */
	await addTask(page, 'Bread');
	await task(page, 'Bread').click();
	await page.getByRole('button', { name: 'Delete task' }).first().click();

	const toast = page.locator('.toast');
	await toast.waitFor();

	/*
	 * It arrives with a movement of its own, from off the top of the paper.
	 * Svelte scopes the keyframes a component declares, so the name on the page
	 * carries a hash in front of the one written in the file.
	 */
	const names = await toast.evaluate((el) =>
		el.getAnimations().map((a) => (a as CSSAnimation).animationName)
	);
	expect(names.some((name) => name.endsWith('toast-arrive'))).toBe(true);

	await toast.evaluate((el) =>
		Promise.all(el.getAnimations().map((a) => a.finished)).then(() => undefined)
	);
	const landed = (await toast.boundingBox())!;
	expect(landed.y).toBeGreaterThan(0);

	// Carried upwards far enough, it goes — and takes the offer of undo with it.
	await page.mouse.move(landed.x + landed.width / 2, landed.y + landed.height / 2);
	await page.mouse.down();
	await page.mouse.move(landed.x + landed.width / 2, landed.y + landed.height / 2 - 60, {
		steps: 6
	});
	await page.mouse.up();

	await expect(toast).toHaveCount(0);
});

test('a message can be thrown out sideways too, and UNDO still works', async ({ page }) => {
	await addTask(page, 'Bread');
	await task(page, 'Bread').click();
	await page.getByRole('button', { name: 'Delete task' }).first().click();

	const toast = page.locator('.toast');
	await toast.waitFor();
	await toast.evaluate((el) =>
		Promise.all(el.getAnimations().map((a) => a.finished)).then(() => undefined)
	);

	// A press that never travels is still a press: UNDO brings the task back.
	await page.getByRole('button', { name: 'UNDO?' }).click();
	await expect(task(page, 'Bread')).toBeVisible();
	await expect(toast).toHaveCount(0);

	/*
	 * And a carry rightwards takes the next one away. The undo put the task
	 * back exactly as it was, which is done — so it already offers its own way
	 * out and must not be ticked again.
	 */
	await expect(task(page, 'Bread')).toHaveAttribute('aria-checked', 'true');
	await page.getByRole('button', { name: 'Delete task' }).first().click();
	await toast.waitFor();
	await toast.evaluate((el) =>
		Promise.all(el.getAnimations().map((a) => a.finished)).then(() => undefined)
	);

	const box = (await toast.boundingBox())!;
	await page.mouse.move(box.x + 30, box.y + box.height / 2);
	await page.mouse.down();
	await page.mouse.move(box.x + 30 + 70, box.y + box.height / 2, { steps: 6 });
	await page.mouse.up();

	await expect(toast).toHaveCount(0);
});

test('a lifted row is offered nowhere that would put it back', async ({ page }) => {
	/*
	 * The rule immediately above the row being carried and the rule immediately
	 * below it are the same rule: both put it back between the same two
	 * neighbours. A short drag used to spend the whole of itself showing one or
	 * other of them, which is an offer to do nothing dressed as a target.
	 */
	await page.getByRole('button', { name: 'Add a task' }).first().click();
	const input = page.getByRole('textbox', { name: 'New task' });
	for (const text of ['One', 'Two', 'Three', 'Four']) {
		await input.fill(text);
		await input.press('End');
		await input.press('Enter');
	}
	await page.keyboard.press('Escape');

	const order = () =>
		page
			.getByRole('checkbox')
			.evaluateAll((boxes) => boxes.map((b) => b.getAttribute('aria-label')));

	const before = await order();
	const row = (await page.getByRole('button', { name: 'Two', exact: true }).boundingBox())!;

	// Lift the second row and hold it over its own place.
	await page.mouse.move(row.x + 30, row.y + row.height / 2);
	await page.mouse.down();
	await page.waitForTimeout(600);
	await page.mouse.move(row.x + 30, row.y + row.height / 2 + 4, { steps: 3 });

	// Nothing offered on its own row.
	await expect(page.locator('.landing')).toHaveCount(0);

	// Nor just above it, which is where it already begins.
	await page.mouse.move(row.x + 30, row.y - 4, { steps: 3 });
	await expect(page.locator('.landing')).toHaveCount(0);

	// Nor just below it, which is the same place said the other way round.
	await page.mouse.move(row.x + 30, row.y + row.height + 4, { steps: 3 });
	await expect(page.locator('.landing')).toHaveCount(0);

	// A real boundary two rows down does offer one.
	await page.mouse.move(row.x + 30, row.y + row.height * 2 + 4, { steps: 3 });
	await expect(page.locator('.landing')).toHaveCount(1);

	// And letting go back over its own place changes nothing at all.
	await page.mouse.move(row.x + 30, row.y + row.height / 2, { steps: 6 });
	await page.mouse.up();
	expect(await order()).toStrictEqual(before);
});

/*
 * One tap does the common thing and two open it for editing — on a task row
 * and on a group title alike, because it is one finger and one sheet.
 *
 * The two are built differently on purpose, and the difference is the point of
 * the pair of tests below: a row acts on the first tap and lets the second
 * take it back, a group title waits. See the note in GroupHeader.
 */

test('one tap opens a task, two mark it done, three mark it half', async ({ page }) => {
	await addTask(page, 'Bread and butter');

	const words = page.getByRole('button', { name: 'Bread and butter', exact: true });
	const box = (await words.boundingBox())!;
	/*
	 * Clear of two things at once: the last few characters, where a run is an
	 * edit and stays one, and the checkbox at the other end, whose target now
	 * reaches a third again past its own mark and over the start of the words.
	 */
	const start = { x: box.x + 20, y: box.y + box.height / 2 };

	/*
	 * One tap opens it. A list is read far more often than it is ticked in one
	 * go, and the checkbox beside the words is the control whose whole job is
	 * the tick — so the words answer the thing the words are for.
	 */
	await page.mouse.click(start.x, start.y);
	await expect(page.getByRole('textbox').first()).toBeFocused();
	await expect(task(page, 'Bread and butter')).toHaveAttribute('aria-checked', 'false');

	/*
	 * Clear of the window before starting again, or the next tap climbs this
	 * run rather than beginning one. The window is 320ms; the wait is generous
	 * so a slow machine cannot make two deliberate taps read as one gesture.
	 */
	await page.keyboard.press('Escape');
	await page.waitForTimeout(450);

	// Two taps mark it done — the second lands on the field the first opened.
	await page.mouse.click(start.x, start.y);
	await page.mouse.click(start.x, start.y);
	await expect(task(page, 'Bread and butter')).toHaveAttribute('aria-checked', 'true');
	await expect(page.getByRole('textbox')).toHaveCount(0);

	await page.waitForTimeout(450);

	// And three mark it half, which is the rung above done.
	await page.mouse.click(start.x, start.y);
	await page.mouse.click(start.x, start.y);
	await page.mouse.click(start.x, start.y);
	await expect(task(page, 'Bread and butter')).toHaveAttribute('aria-checked', 'mixed');
});

test('a run of taps at the end of the words never ticks the task', async ({ page }) => {
	/*
	 * A finger in the last few characters is reaching for the end of the task —
	 * to add to it, or to press Enter and start the next thing there. Two taps
	 * there are two attempts at the same thing, not a tick.
	 */
	await addTask(page, 'Bread');

	const words = page.getByRole('button', { name: 'Bread', exact: true });
	const box = (await words.boundingBox())!;
	// Just past the last letter, which is where somebody adding to it would aim.
	const end = { x: box.x + box.width - 4, y: box.y + box.height / 2 };

	await page.mouse.click(end.x, end.y);
	await page.mouse.click(end.x, end.y);
	await page.mouse.click(end.x, end.y);

	await expect(task(page, 'Bread')).toHaveAttribute('aria-checked', 'false');
	await expect(page.getByRole('textbox').first()).toBeFocused();
});

test('one tap folds a group, and two open its name', async ({ page }) => {
	await addTask(page, 'Bread');

	const title = page.getByRole('button', { name: 'My list' });
	const icon = page.getByRole('button', { name: /^(Collapse|Expand) group/ });

	await title.click();
	await expect(icon).toHaveAttribute('aria-expanded', 'false');
	await expect(task(page, 'Bread')).toHaveCount(0);

	await title.click();
	await expect(icon).toHaveAttribute('aria-expanded', 'true');

	/*
	 * The fold is held back for the window rather than done and undone, so two
	 * taps never fold the group at all — a whole list folding and unfolding
	 * under the thumb is a far worse flicker than the wait it would save.
	 */
	await title.dblclick();
	await expect(page.getByRole('textbox', { name: 'Group title' })).toBeVisible();
	await expect(icon).toHaveAttribute('aria-expanded', 'true');
});

test('a row that runs out of room fills up, and the rest starts the next one', async ({ page }) => {
	/*
	 * Never `maxlength`. On a phone a field that stops accepting characters is
	 * indistinguishable from a keyboard that has died, in the middle of a
	 * sentence, with nothing said. Nothing is refused and nothing is lost.
	 */
	await page.getByRole('button', { name: 'Add a task' }).first().click();
	const field = page.getByRole('textbox', { name: 'New task' });

	// Two hundred is the limit, so this runs ten characters past it, with a
	// space sitting exactly on the boundary.
	await field.fill(`${'A'.repeat(200)} SPILLOVER`);

	// The word travelled whole rather than being cut at the two hundredth
	// character, and it is in the row below with the caret after it, ready to
	// carry on. The row above kept its full complement.
	await expect(page.getByRole('textbox', { name: 'New task' })).toHaveValue('SPILLOVER');
	await expect(task(page, 'A'.repeat(200))).toBeVisible();

	await page.keyboard.press('Escape');
});

test('Enter carries what is in front of the caret down to a new task', async ({ page }) => {
	/*
	 * Enter means "and the next one", and it now means it from wherever the
	 * caret is. It used to open an empty row wherever the caret stood, so
	 * splitting a task in two meant retyping the second half.
	 */
	await addTask(page, 'Bread and butter');

	await page.getByRole('button', { name: 'Bread and butter', exact: true }).click();
	const field = page.getByRole('textbox').first();
	await expect(field).toBeFocused();

	// Between the two things, which is where a person would break the line.
	await field.evaluate((el: HTMLTextAreaElement) => el.setSelectionRange(6, 6));
	await field.press('Enter');

	// The row above kept what was behind the caret; the rest came down with it,
	// already in the row below and ready to be added to.
	await expect(task(page, 'Bread')).toBeVisible();
	await expect(page.getByRole('textbox', { name: 'New task' })).toHaveValue('and butter');

	await page.getByRole('textbox', { name: 'New task' }).press('Enter');
	await expect(task(page, 'and butter')).toBeVisible();
});

test('Enter at the very start leaves the task whole', async ({ page }) => {
	// The head would be empty, and a task may not be — so nothing is pushed
	// down and an empty row opens beneath, which is what Enter always did.
	await addTask(page, 'Bread');

	await page.getByRole('button', { name: 'Bread', exact: true }).click();
	const field = page.getByRole('textbox').first();
	await field.evaluate((el: HTMLTextAreaElement) => el.setSelectionRange(0, 0));
	await field.press('Enter');

	await expect(task(page, 'Bread')).toBeVisible();
	await expect(page.getByRole('textbox', { name: 'New task' })).toHaveValue('');
});

test('the count of what is left appears late, and under the checkbox', async ({ page }) => {
	// A phone, where a row long enough to be running out of room is several
	// lines tall — which is the shape the count is placed for.
	await page.setViewportSize({ width: 390, height: 760 });

	await page.getByRole('button', { name: 'Add a task' }).first().click();
	const field = page.getByRole('textbox', { name: 'New task' });
	const counter = page.locator('.counter');

	// Quiet through the whole of a long task: there is nothing to do about it
	// until the very end, since the row goes on taking characters either way.
	await field.fill('A'.repeat(189));
	await expect(counter).toHaveCount(0);

	// Ten left, and counting down from there.
	await field.fill('A'.repeat(190));
	await expect(counter).toHaveText('10');
	await field.fill('A'.repeat(196));
	await expect(counter).toHaveText('4');

	/*
	 * Under the mark rather than out in the gutter beside the first line. The
	 * writing is being done at the foot of a long row, so the count belongs
	 * there — and it is in the checkbox's column, not the words'.
	 */
	const where = await page.evaluate(() => {
		const row = document.querySelector('.tasks li:has(.counter)')!.getBoundingClientRect();
		const mark = document.querySelector('.tasks li:has(.counter) svg')!.getBoundingClientRect();
		const count = document.querySelector('.counter')!.getBoundingClientRect();
		const field = document.querySelector('.tasks li:has(.counter) textarea')!;
		const style = getComputedStyle(field);
		return {
			rowBottom: row.bottom,
			rowLeft: row.left,
			markBottom: mark.bottom,
			count,
			fieldBottom: field.getBoundingClientRect().bottom,
			padBottom: parseFloat(style.paddingBottom),
			line: parseFloat(style.lineHeight)
		};
	});

	// Below the mark, and never right of the words.
	expect(where.count.top).toBeGreaterThan(where.markBottom);
	expect(where.count.left).toBeGreaterThanOrEqual(where.rowLeft - 1);

	/*
	 * And level with the line being typed, rather than with the foot of the
	 * row. The field pads itself by half a target less half a line at each end,
	 * so a one-line row is a --touch square with its writing in the middle —
	 * which leaves the last line's own middle sitting that same half-target
	 * above the bottom of the row. A count with no height of its own sat its
	 * digits on the floor of that padding instead, a good few pixels under the
	 * line it was counting.
	 */
	const lastLine = where.fieldBottom - where.padBottom - where.line / 2;
	const middle = where.count.top + where.count.height / 2;
	expect(Math.abs(middle - lastLine)).toBeLessThan(2);

	await page.keyboard.press('Escape');
});

test('the checkbox answers to more than the square it draws', async ({ page }) => {
	/*
	 * A checkbox is a small square in a line of words, and the words are a much
	 * bigger thing to hit. So its target reaches a third again past its own
	 * mark and the whole height of the row — a finger going for the box and
	 * landing on the first word still ticks the task, which is what it meant.
	 */
	await addTask(page, 'Bread and butter and jam and cheese and everything else besides');

	const reach = await page.evaluate(() => {
		const box = document.querySelector('.tasks li [role="checkbox"]')!.getBoundingClientRect();
		const mark = document.querySelector('.tasks li [role="checkbox"] svg')!.getBoundingClientRect();
		const row = document.querySelector('.tasks li')!.getBoundingClientRect();
		return { box, markRight: mark.right, rowHeight: row.height, rowTop: row.top };
	});

	// Wider than the mark by a good margin, and the full height of the row.
	expect(reach.box.width).toBeGreaterThan(reach.markRight - reach.box.left + 20);
	expect(Math.abs(reach.box.height - reach.rowHeight)).toBeLessThan(2);

	// And a tap inside that reach, past where the mark stops, still ticks it.
	await page.mouse.click(reach.box.right - 4, reach.rowTop + reach.rowHeight / 2);
	await expect(page.getByRole('checkbox').first()).toHaveAttribute('aria-checked', 'true');
});

test('a task drawn over two lines is edited over two lines', async ({ page }) => {
	const long =
		'A rather long task that certainly runs onto a second line however wide the sheet is';
	await addTask(page, long);

	const words = page.getByRole('button', { name: long, exact: true });
	const read = (await words.boundingBox())!.height;

	await words.click();
	const field = page.getByRole('textbox').first();
	await expect(field).toBeFocused();

	/*
	 * A single-line input would collapse the row to one line and hide the end
	 * of the task behind its own left edge, reflowing the sheet on every tap.
	 * The field is as tall as the words were, give or take the padding.
	 */
	const editing = (await field.boundingBox())!.height;
	expect(Math.abs(editing - read)).toBeLessThan(12);
	expect(await field.evaluate((el) => el.tagName)).toBe('TEXTAREA');
});

test('an address is shown short, and still goes where it says', async ({ page }) => {
	await addTask(page, 'Recipe https://heracl.es/projects/2024/consumma tonight');

	const link = page.locator('.tasks a').first();

	// No protocol, and the middle of the path elided — what is wanted is which
	// site and which page, not every character of how to get there.
	await expect(link).toHaveText('heracl.es/…/consumma');

	// The href keeps all of it: this is a reading, not an edit.
	await expect(link).toHaveAttribute('href', 'https://heracl.es/projects/2024/consumma');

	// And the text was never touched, so the export still has the whole URL.
	const exported = await page.evaluate(() => JSON.stringify(localStorage.getItem('consumma:doc')));
	expect(exported).toContain('https://heracl.es/projects/2024/consumma');
});

/*
 * The list is held in this tab and lives on a key in this browser, so a link
 * written by whoever else is on the list never navigates it away — and the
 * page it opens is told nothing about where it came from and given no handle
 * on the tab it came from.
 */
test('a link opens in its own tab, and carries nothing with it', async ({ page }) => {
	await addTask(page, 'Recipe https://heracl.es/consumma tonight');

	const link = page.locator('.tasks a').first();
	await expect(link).toHaveAttribute('target', '_blank');

	const rel = (await link.getAttribute('rel'))!.split(/\s+/);
	expect(rel).toContain('noopener');
	expect(rel).toContain('noreferrer');
	expect(rel).toContain('nofollow');
});

test('only three schemes are ever drawn as a link', async ({ page }) => {
	// The app hands this string to an href, and two of these run code.
	await addTask(page, 'Nope javascript:alert(1) and blob:https://heracl.es/x either');

	await expect(page.locator('.tasks a')).toHaveCount(0);
});

/** Adds a named group with one task in it, and returns its title button. */
async function addGroup(page: Page, name: string, index: number) {
	await page.getByRole('button', { name: 'Add a group' }).click();
	const field = page.getByRole('textbox', { name: 'New group' });
	await field.fill(name);
	await field.press('Enter');
	await addTask(page, `${name} thing`, index);
	return page.getByRole('button', { name });
}

test('the rule a carried group is dropped on is drawn where it will land', async ({ page }) => {
	/*
	 * The landing rule and the drop were counted in two different lists. The
	 * hit test skips the group being carried, because a group cannot land
	 * beside itself — so its answer counts the groups that are staying still.
	 * The markup drew the rule by its own loop, which counts every group there
	 * is, the carried one included. The two agree until the finger passes the
	 * hole the carried group left, and from there the rule is drawn one group
	 * short of where the group actually goes.
	 */
	await addTask(page, 'Bread');
	await addGroup(page, 'Market', 1);
	await addGroup(page, 'Deli', 2);

	const title = page.getByRole('button', { name: 'My list' });
	const from = (await title.boundingBox())!;

	await page.mouse.move(from.x + from.width / 2, from.y + from.height / 2);
	await page.mouse.down();
	await page.waitForTimeout(600);

	// Everything folds while one is carried, so the titles are all there is.
	const deli = page.getByRole('button', { name: 'Deli' });
	const market = page.getByRole('button', { name: 'Market' });

	// Down past Market, into the gap between Market and Deli.
	const over = (await deli.boundingBox())!;
	await page.mouse.move(over.x + over.width / 2, over.y + 2);

	const rule = page.locator('.landing');
	await expect(rule).toHaveCount(1);

	// The rule is below Market and above Deli, which is the gap the finger is in.
	const drawn = (await rule.boundingBox())!;
	const above = (await market.boundingBox())!;
	const below = (await deli.boundingBox())!;
	expect(drawn.y).toBeGreaterThanOrEqual(above.y + above.height);
	expect(drawn.y).toBeLessThan(below.y);

	await page.mouse.up();

	// And that is where it went.
	const order = await page.getByRole('button', { name: /^(My list|Market|Deli)$/ }).allInnerTexts();
	expect(order).toStrictEqual(['MARKET', 'MY LIST', 'DELI']);
});
