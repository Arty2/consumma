import { expect, test, type Page } from '@playwright/test';

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

test('a fresh sheet is one empty box and an ellipsis', async ({ page }) => {
	await expect(page.getByRole('button', { name: 'Add a task' })).toHaveCount(1);
	await expect(page.getByRole('button', { name: 'Add a group' })).toBeVisible();
	await expect(page.getByRole('checkbox')).toHaveCount(0);
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

	await page.getByRole('button', { name: 'Bread', exact: true }).hover();
	await page.getByRole('button', { name: 'Delete task' }).first().click();

	await expect(task(page, 'Bread')).toHaveCount(0);

	await page.getByRole('button', { name: 'UNDO' }).click();
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

	await page.getByRole('button', { name: 'CLEAR' }).click();

	await expect(task(page, 'Bread')).toHaveCount(0);
	await expect(task(page, 'Coffee')).toBeVisible();
	await expect(task(page, 'Milk')).toBeVisible();

	await page.getByRole('button', { name: 'UNDO' }).click();
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

	await page.getByRole('button', { name: 'Market' }).click();
	await expect(task(page, 'Bread')).toHaveCount(0);
	await expect(page.getByText('[ … 1 ]')).toBeVisible();

	await page.reload();
	await expect(page.getByText('[ … 1 ]')).toBeVisible();

	await page.getByRole('button', { name: 'Market' }).click();
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
