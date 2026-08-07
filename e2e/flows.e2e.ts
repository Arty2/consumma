import { expect, test } from '@playwright/test';
import { fromMenu, menuButton, openMenu, addTask } from './app';

/*
 * M6's acceptance, minus the two things a headless browser cannot judge: the
 * native share sheet on a real phone, and how it all looks.
 *
 * There is no server here — the dev preview has no blob store — so anything
 * that would reach the network is asserted through the UI's own reporting
 * rather than pretended to work. Sync against a real store is covered by
 * tests/sync.spec.ts, which drives the actual server module.
 */

function task(page: Page, text: string) {
	return page.getByRole('checkbox', { name: text });
}

test.beforeEach(async ({ page }) => {
	await page.goto('/');
	await page.evaluate(() => localStorage.clear());
	await page.reload();
});

test('a code exists from the first run, and is never in the URL', async ({ page }) => {
	await openMenu(page);

	const code = await page.locator('.code').first().innerText();
	// Twelve hex characters, shown in groups of four for reading aloud.
	expect(code.replace(/\s/g, '')).toMatch(/^[0-9a-f]{12}$/);

	expect(page.url()).not.toContain(code.replace(/\s/g, ''));
	expect(page.url()).toBe(new URL(page.url()).origin + '/');
});

test('the page carries a burger, and a sync button only when there is a reason', async ({
	page
}) => {
	// Nothing else is on the paper.
	for (const gone of ['SYNC', 'SHARE', 'IMPORT', 'EXPORT', 'CLEAR', 'DELETE']) {
		await expect(page.getByRole('button', { name: gone, exact: true })).toHaveCount(0);
	}

	// The burger says nothing about syncing; that is the other button's job.
	await expect(menuButton(page)).toHaveAttribute('aria-label', 'Menu');

	const syncButton = page.getByRole('button', { name: /^Sync —/ });
	const waiting = async () => {
		const label = await syncButton.getAttribute('aria-label');
		return Number(label?.match(/(\d+) change/)?.[1] ?? 0);
	};

	// A fresh sheet already has its first group waiting to go.
	const before = await waiting();
	expect(before).toBeGreaterThan(0);

	await addTask(page, 'Bread');
	expect(await waiting()).toBe(before + 1);

	// It sits to the left of the burger, not in place of it.
	const sync = (await syncButton.boundingBox())!;
	const menu = (await menuButton(page).boundingBox())!;
	expect(sync.x).toBeLessThan(menu.x);

	// And what it counts is what the menu says.
	await openMenu(page);
	await expect(page.getByText(`${before + 1} changes are waiting to go.`)).toBeVisible();
});

test('the sync copy separates what is waiting from why it matters', async ({ page, context }) => {
	await addTask(page, 'Bread');
	await openMenu(page);

	// The count is the headline; the consequence is its own line.
	await expect(page.getByText(/\d+ changes? (is|are) waiting to go\./)).toBeVisible();
	await expect(page.getByText('Nobody else can see them until you sync.')).toBeVisible();

	await context.setOffline(true);
	await page.getByRole('button', { name: /Sync now|Syncing/ }).click();

	/*
	 * Being unreachable is a condition, not a failure — and it never swallows
	 * the count, which is exactly when someone wants to know it. The old copy
	 * replaced the whole line with "Offline.", which read as an error.
	 */
	await expect(page.getByText(/\d+ changes? (is|are) waiting to go\./)).toBeVisible();
	await expect(page.getByText(/safe on this device/)).toBeVisible();

	await context.setOffline(false);
});

test('the invitation carries the link and the code together, with no query string', async ({
	page,
	context
}) => {
	await context.grantPermissions(['clipboard-read', 'clipboard-write']);

	await openMenu(page);

	const code = (await page.locator('.code').first().innerText()).replace(/\s/g, '');
	await page.getByRole('button', { name: 'Copy', exact: true }).click();

	const invitation = await page.evaluate(() => navigator.clipboard.readText());
	const origin = new URL(page.url()).origin;

	// Either half alone is useless, so one payload carries both.
	expect(invitation).toContain(origin);
	expect(invitation.replace(/\s/g, '')).toContain(code);

	// And the link stays bare — no query, no fragment.
	const link = invitation.match(/https?:\/\/\S+/)![0];
	expect(link).toBe(origin);
	expect(link).not.toContain('?');
	expect(link).not.toContain('#');
	expect(link).not.toContain(code);
});

test('EXPORT copies the whole list and says how many', async ({ page, context }) => {
	await context.grantPermissions(['clipboard-read', 'clipboard-write']);

	await addTask(page, 'Bread');
	await addTask(page, 'Coffee');
	await task(page, 'Bread').click();

	await fromMenu(page, 'Export');
	await expect(page.getByText('Copied 2 tasks.')).toBeVisible();

	// The first group has a name now, so the export carries its heading.
	const clipboard = await page.evaluate(() => navigator.clipboard.readText());
	expect(clipboard).toBe('## My list\n\n- [x] Bread\n- [ ] Coffee\n');
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

	await fromMenu(page, 'Export');
	const exported = await page.evaluate(() => navigator.clipboard.readText());

	// A fresh device with nothing on it.
	await page.evaluate(() => localStorage.clear());
	await page.reload();
	await expect(page.getByRole('checkbox')).toHaveCount(0);

	await fromMenu(page, 'Import');
	await page.getByRole('button', { name: 'Add', exact: true }).click();

	await expect(task(page, 'Bread')).toHaveAttribute('aria-checked', 'true');
	await expect(task(page, 'Coffee')).toHaveAttribute('aria-checked', 'mixed');
	await expect(page.getByRole('button', { name: 'Market' })).toBeVisible();

	await fromMenu(page, 'Export');
	expect(await page.evaluate(() => navigator.clipboard.readText())).toBe(exported);
});

test('IMPORT skips duplicates and says so', async ({ page, context }) => {
	await context.grantPermissions(['clipboard-read', 'clipboard-write']);

	await addTask(page, 'Bread');
	await page.evaluate(() => navigator.clipboard.writeText('- [ ] Bread\n- [ ] Coffee\n'));

	await fromMenu(page, 'Import');
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

	await fromMenu(page, 'Import');
	await expect(page.getByText('That doesn’t look like a task list.')).toBeVisible();

	await page.getByRole('button', { name: 'Close' }).click();
	await expect(page.getByRole('checkbox')).toHaveCount(1);
});

test('CLEAR asks first, then clears, and the undo still works', async ({ page }) => {
	await addTask(page, 'Bread');
	await addTask(page, 'Coffee');
	await task(page, 'Bread').click();

	await fromMenu(page, 'Clear');

	const confirm = page.getByRole('dialog', { name: 'Clear completed tasks' });
	await expect(confirm).toBeVisible();
	await expect(confirm).toContainText('Remove 1 completed task?');
	await expect(confirm).toContainText('everyone on this list');

	// Cancel changes nothing.
	await page.getByRole('button', { name: 'Cancel' }).click();
	await expect(task(page, 'Bread')).toBeVisible();

	await fromMenu(page, 'Clear');
	await page.getByRole('button', { name: 'Clear', exact: true }).click();

	await expect(task(page, 'Bread')).toHaveCount(0);

	// The confirm stops the accident; the undo covers the change of mind.
	await page.getByRole('button', { name: 'UNDO' }).click();
	await expect(task(page, 'Bread')).toBeVisible();
});

test('DELETE shows the code one last time, then wipes only this device', async ({ page }) => {
	await addTask(page, 'Bread');

	await openMenu(page);
	const code = (await page.locator('.code').first().innerText()).replace(/\s/g, '');
	await page.getByRole('button', { name: 'Close' }).click();

	await fromMenu(page, 'Delete');

	const confirm = page.getByRole('dialog', { name: /Remove this list/ });
	await expect(confirm).toContainText('Everyone else keeps it');
	await expect(confirm).toContainText(code.replace(/(.{4})/g, '$1 ').trim());
	// It says plainly that unsent work goes too.
	await expect(confirm).toContainText('never reached anyone else');

	await page.getByRole('button', { name: 'Cancel' }).click();
	await expect(task(page, 'Bread')).toBeVisible();

	await fromMenu(page, 'Delete');
	await page.getByRole('button', { name: 'Delete', exact: true }).click();

	await expect(page.getByRole('checkbox')).toHaveCount(0);

	// A new code, because this device is no longer on the old list.
	await openMenu(page);
	const fresh = (await page.locator('.code').first().innerText()).replace(/\s/g, '');
	expect(fresh).not.toBe(code);
});

test('joining with tasks already here asks rather than deciding', async ({ page }) => {
	await addTask(page, 'Bread');

	await openMenu(page);
	await page.getByRole('textbox', { name: 'Code' }).fill('0123 4567 89ab');
	await page.getByRole('button', { name: 'Join' }).click();

	// Merge or discard is offered as a choice, never decided silently.
	await expect(page.getByRole('button', { name: 'Take them' })).toBeVisible();
	await expect(page.getByRole('button', { name: 'Leave them' })).toBeVisible();
	await expect(page.getByRole('dialog', { name: 'Menu' })).toContainText('1 task here');
});

test('a second sync tap inside the cooldown costs nothing', async ({ page }) => {
	let requests = 0;
	await page.route('**/api/room/**', (route) => {
		requests++;
		return route.abort();
	});

	await addTask(page, 'Bread');
	await openMenu(page);

	const button = page.getByRole('button', { name: /^Sync now/ });
	await button.click();

	// The cooldown is the whole reason a double tap is free.
	await expect(button).toBeDisabled();
	await expect(button).toContainText(/Sync now \(\d+\)/);

	const after = requests;
	await page.waitForTimeout(500);
	expect(requests).toBe(after);
});

test('a panel closes on Escape and returns focus to what opened it', async ({ page }) => {
	await openMenu(page);

	await page.keyboard.press('Escape');
	await expect(page.getByRole('dialog')).toHaveCount(0);
	await expect(menuButton(page)).toBeFocused();
});

test('the menu reports being unable to reach the list, and keeps the tasks', async ({ page }) => {
	await addTask(page, 'Bread');

	await page.route('**/api/room/**', (route) => route.abort());

	await openMenu(page);
	await page.getByRole('button', { name: /Sync now|Syncing/ }).click();

	await expect(page.getByRole('alert')).toContainText('Couldn’t reach the list');
	await page.keyboard.press('Escape');

	// The plain-language failure, and nothing lost.
	await expect(task(page, 'Bread')).toBeVisible();
});
