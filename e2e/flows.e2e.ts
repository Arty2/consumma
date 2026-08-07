import { expect, test, type Page } from '@playwright/test';

/*
 * M6's acceptance, minus the two things a headless browser cannot judge: the
 * native share sheet on a real phone, and how it all looks.
 *
 * There is no server here — the dev preview has no blob store — so anything
 * that would reach the network is asserted through the UI's own reporting
 * rather than pretended to work. Sync against a real store is covered by
 * tests/sync.spec.ts, which drives the actual server module.
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

test.beforeEach(async ({ page }) => {
	await page.goto('/');
	await page.evaluate(() => localStorage.clear());
	await page.reload();
});

test('a code exists from the first run, and is never in the URL', async ({ page }) => {
	await page.getByRole('button', { name: 'SYNC', exact: true }).click();

	const code = await page.locator('.code').first().innerText();
	// Twelve hex characters, shown in groups of four for reading aloud.
	expect(code.replace(/\s/g, '')).toMatch(/^[0-9a-f]{12}$/);

	expect(page.url()).not.toContain(code.replace(/\s/g, ''));
	expect(page.url()).toBe(new URL(page.url()).origin + '/');
});

test('the status mark says how much has not been sent', async ({ page }) => {
	await addTask(page, 'Bread');

	const mark = page.getByRole('button', { name: /not sent|Synced|Offline/ });
	await expect(mark).toBeVisible();
	await expect(mark).toHaveAttribute('aria-label', /change|changes/);

	// Tapping it opens SYNC, which is the only way to send anything.
	await mark.click();
	await expect(page.getByRole('dialog', { name: 'Sync' })).toBeVisible();
});

test('EXPORT copies the whole list and says how many', async ({ page, context }) => {
	await context.grantPermissions(['clipboard-read', 'clipboard-write']);

	await addTask(page, 'Bread');
	await addTask(page, 'Coffee');
	await task(page, 'Bread').click();

	await page.getByRole('button', { name: 'EXPORT', exact: true }).click();
	await expect(page.getByText('Copied 2 tasks.')).toBeVisible();

	const clipboard = await page.evaluate(() => navigator.clipboard.readText());
	expect(clipboard).toBe('- [x] Bread\n- [ ] Coffee\n');
});

test('EXPORT then IMPORT into an empty list reproduces everything', async ({ page, context }) => {
	await context.grantPermissions(['clipboard-read', 'clipboard-write']);

	await page.getByRole('button', { name: 'Add a group' }).click();
	const title = page.getByRole('textbox', { name: 'New group' });
	await title.fill('Market');
	await title.press('Enter');

	await addTask(page, 'Bread', 1);
	await addTask(page, 'Coffee', 1);
	await task(page, 'Bread').click();

	await task(page, 'Coffee').focus();
	await page.keyboard.press('Shift+ ');

	await page.getByRole('button', { name: 'EXPORT', exact: true }).click();
	const exported = await page.evaluate(() => navigator.clipboard.readText());

	// A fresh device with nothing on it.
	await page.evaluate(() => localStorage.clear());
	await page.reload();
	await expect(page.getByRole('checkbox')).toHaveCount(0);

	await page.getByRole('button', { name: 'IMPORT', exact: true }).click();
	await page.getByRole('button', { name: 'Add', exact: true }).click();

	await expect(task(page, 'Bread')).toHaveAttribute('aria-checked', 'true');
	await expect(task(page, 'Coffee')).toHaveAttribute('aria-checked', 'mixed');
	await expect(page.getByRole('button', { name: 'Market' })).toBeVisible();

	await page.getByRole('button', { name: 'EXPORT', exact: true }).click();
	expect(await page.evaluate(() => navigator.clipboard.readText())).toBe(exported);
});

test('IMPORT skips duplicates and says so', async ({ page, context }) => {
	await context.grantPermissions(['clipboard-read', 'clipboard-write']);

	await addTask(page, 'Bread');
	await page.evaluate(() => navigator.clipboard.writeText('- [ ] Bread\n- [ ] Coffee\n'));

	await page.getByRole('button', { name: 'IMPORT', exact: true }).click();
	await page.getByRole('button', { name: 'Add', exact: true }).click();

	await expect(page.getByText('Added 1, skipped 1 already there.')).toBeVisible();
	await expect(page.getByRole('checkbox')).toHaveCount(2);
});

test('IMPORT refuses something that is not a task list, and changes nothing', async ({
	page,
	context
}) => {
	await context.grantPermissions(['clipboard-read', 'clipboard-write']);

	await addTask(page, 'Bread');
	await page.evaluate(() => navigator.clipboard.writeText('just some prose, honestly'));

	await page.getByRole('button', { name: 'IMPORT', exact: true }).click();
	await expect(page.getByText('That doesn’t look like a task list.')).toBeVisible();

	await page.getByRole('button', { name: 'Close' }).click();
	await expect(page.getByRole('checkbox')).toHaveCount(1);
});

test('CLEAR asks first, then clears, and the undo still works', async ({ page }) => {
	await addTask(page, 'Bread');
	await addTask(page, 'Coffee');
	await task(page, 'Bread').click();

	await page.getByRole('button', { name: 'CLEAR', exact: true }).click();

	const confirm = page.getByRole('dialog', { name: 'Clear completed tasks' });
	await expect(confirm).toBeVisible();
	await expect(confirm).toContainText('Remove 1 completed task?');
	await expect(confirm).toContainText('everyone on this list');

	// Cancel changes nothing.
	await page.getByRole('button', { name: 'Cancel' }).click();
	await expect(task(page, 'Bread')).toBeVisible();

	await page.getByRole('button', { name: 'CLEAR', exact: true }).click();
	await page.getByRole('button', { name: 'Clear', exact: true }).click();

	await expect(task(page, 'Bread')).toHaveCount(0);

	// The confirm stops the accident; the undo covers the change of mind.
	await page.getByRole('button', { name: 'UNDO' }).click();
	await expect(task(page, 'Bread')).toBeVisible();
});

test('DELETE shows the code one last time, then wipes only this device', async ({ page }) => {
	await addTask(page, 'Bread');

	await page.getByRole('button', { name: 'SYNC', exact: true }).click();
	const code = (await page.locator('.code').first().innerText()).replace(/\s/g, '');
	await page.getByRole('button', { name: 'Close' }).click();

	await page.getByRole('button', { name: 'DELETE', exact: true }).click();

	const confirm = page.getByRole('dialog', { name: /Remove this list/ });
	await expect(confirm).toContainText('Everyone else keeps it');
	await expect(confirm).toContainText(code.replace(/(.{4})/g, '$1 ').trim());
	// It says plainly that unsent work goes too.
	await expect(confirm).toContainText('never reached anyone else');

	await page.getByRole('button', { name: 'Cancel' }).click();
	await expect(task(page, 'Bread')).toBeVisible();

	await page.getByRole('button', { name: 'DELETE', exact: true }).click();
	await page.getByRole('button', { name: 'Delete', exact: true }).click();

	await expect(page.getByRole('checkbox')).toHaveCount(0);

	// A new code, because this device is no longer on the old list.
	await page.getByRole('button', { name: 'SYNC', exact: true }).click();
	const fresh = (await page.locator('.code').first().innerText()).replace(/\s/g, '');
	expect(fresh).not.toBe(code);
});

test('joining with tasks already here asks rather than deciding', async ({ page }) => {
	await addTask(page, 'Bread');

	await page.getByRole('button', { name: 'SYNC', exact: true }).click();
	await page.getByRole('textbox', { name: 'Code' }).fill('0123 4567 89ab');
	await page.getByRole('button', { name: 'Join' }).click();

	// Merge or discard is offered as a choice, never decided silently.
	await expect(page.getByRole('button', { name: 'Take them' })).toBeVisible();
	await expect(page.getByRole('button', { name: 'Leave them' })).toBeVisible();
	await expect(page.getByRole('dialog', { name: 'Sync' })).toContainText('1 task here');
});

test('a second sync tap inside the cooldown costs nothing', async ({ page }) => {
	let requests = 0;
	await page.route('**/api/room/**', (route) => {
		requests++;
		return route.abort();
	});

	await addTask(page, 'Bread');
	await page.getByRole('button', { name: 'SYNC', exact: true }).click();

	const button = page.getByRole('button', { name: /^Sync now/ });
	await button.click();

	// The cooldown is the whole reason a double tap is free.
	await expect(button).toBeDisabled();
	await expect(button).toContainText(/Sync now \(\d+\)/);

	const after = requests;
	await page.waitForTimeout(500);
	expect(requests).toBe(after);
});

test('a modal closes on Escape and returns focus to what opened it', async ({ page }) => {
	const sync = page.getByRole('button', { name: 'SYNC', exact: true });
	await sync.click();

	await expect(page.getByRole('dialog', { name: 'Sync' })).toBeVisible();

	await page.keyboard.press('Escape');
	await expect(page.getByRole('dialog')).toHaveCount(0);
	await expect(sync).toBeFocused();
});

test('the sync panel reports being unable to reach the list, and keeps the tasks', async ({
	page
}) => {
	await addTask(page, 'Bread');

	await page.route('**/api/room/**', (route) => route.abort());

	await page.getByRole('button', { name: 'SYNC', exact: true }).click();
	await page.getByRole('button', { name: /Sync now|Syncing/ }).click();

	await expect(page.getByRole('alert')).toContainText('Couldn’t reach the list');
	await page.keyboard.press('Escape');

	// The plain-language failure, and nothing lost.
	await expect(task(page, 'Bread')).toBeVisible();
});
