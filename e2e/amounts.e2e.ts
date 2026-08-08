import { expect, test, type Page } from '@playwright/test';
import { fromMenu } from './menu';

/*
 * A shopping list already carries its numbers. These are the checks that they
 * are read rather than merely displayed: a count at the front, a price at the
 * back, a column that lines up, and a total on the group's own header that
 * says what is still to buy.
 *
 * The list is the one from the note: 5,08 + 20.00 + 5,90 with the leeks
 * already in the basket, which comes to 30,98.
 */

async function addTask(page: Page, text: string) {
	await page.keyboard.press('Escape');
	await page.getByRole('button', { name: 'Add a task' }).first().click();

	const input = page.getByRole('textbox', { name: 'New task' });
	await input.fill(text);
	await input.press('Enter');
	await page.keyboard.press('Escape');
}

function task(page: Page, text: string) {
	return page.getByRole('checkbox', { name: text });
}

function total(page: Page) {
	return page.locator('section .total');
}

async function theList(page: Page) {
	for (const text of ['2x Tomatos 5,08', '3 Potatos 20.00', 'Onions 5,90', '5 Leeks 10']) {
		await addTask(page, text);
	}
}

test.beforeEach(async ({ page }) => {
	await page.goto('/');
	await page.evaluate(() => localStorage.clear());
	await page.reload();
});

test('the group header says what the list still comes to', async ({ page }) => {
	await theList(page);

	// Everything is still to buy.
	await expect(total(page)).toHaveText('40,98');

	// The leeks go in the basket. Done is bought, so it stops counting.
	await task(page, '5 Leeks 10').click();
	await expect(total(page)).toHaveText('30,98');
});

test('half counts in full, because half a task is still on the list', async ({ page }) => {
	await addTask(page, 'Bread 10');
	await addTask(page, 'Milk 20');
	await expect(total(page)).toHaveText('30');

	await task(page, 'Milk 20').focus();
	await page.keyboard.press('Shift+ ');
	await expect(task(page, 'Milk 20')).toHaveAttribute('aria-checked', 'mixed');
	await expect(total(page)).toHaveText('30');

	// And done stops counting from the same place.
	await task(page, 'Milk 20').click();
	await expect(task(page, 'Milk 20')).toHaveAttribute('aria-checked', 'true');
	await expect(total(page)).toHaveText('10');
});

test('a group with no prices in it has no total', async ({ page }) => {
	await addTask(page, 'Bread');
	await expect(total(page)).toHaveCount(0);

	await addTask(page, 'Milk 2,50');
	await expect(total(page)).toHaveText('2,50');
});

test('the total stays when the group is collapsed or being renamed', async ({ page }) => {
	await theList(page);

	await page.getByRole('button', { name: 'Collapse group' }).click();
	await expect(page.getByRole('button', { name: 'Expand group' })).toBeVisible();
	await expect(total(page)).toHaveText('40,98');

	await page.getByRole('button', { name: 'Expand group' }).click();
	await page.getByRole('button', { name: 'My list' }).click();
	await expect(page.getByRole('textbox', { name: 'Group title' })).toBeVisible();
	await expect(total(page)).toHaveText('40,98');
});

test('the figures are set apart, and the words are not', async ({ page }) => {
	await theList(page);

	const row = page.getByRole('button', { name: '2x Tomatos 5,08', exact: true });
	const count = row.locator('.amount');
	const name = row.locator('.name');
	const price = row.locator('.cost');

	await expect(count).toHaveText('2x');
	await expect(price).toHaveText('5,08');

	// The name keeps the casing it was typed in, and the caps stay CSS.
	await expect(name).toHaveText('Tomatos');
	expect(await name.innerText()).toBe('TOMATOS');

	for (const figure of [count, price, total(page)]) {
		const stack = await figure.evaluate((el) => getComputedStyle(el).fontFamily);
		expect(stack).toContain('ui-monospace');
		await expect(figure).toHaveCSS('font-weight', '700');
		await expect(figure).toHaveCSS('font-variant-numeric', 'tabular-nums');
	}

	// The words beside them are still the one hand the sheet is written in.
	const words = await name.evaluate((el) => getComputedStyle(el).fontFamily);
	expect(words).toContain('Graphe');
});

test('the prices end level, and the names begin level', async ({ page }) => {
	await theList(page);

	const edges = await page.evaluate(() => {
		const rows = [...document.querySelectorAll('.tasks li button.text')];
		return rows
			.filter((row) => row.querySelector('.cost'))
			.map((row) => ({
				name: row.querySelector('.name')!.getBoundingClientRect().left,
				price: row.querySelector('.cost')!.getBoundingClientRect().right
			}));
	});

	expect(edges.length).toBe(4);
	for (const edge of edges) {
		// "Onions" has no count in front of it and still starts where the rest do.
		expect(Math.abs(edge.name - edges[0].name)).toBeLessThan(1);
		expect(Math.abs(edge.price - edges[0].price)).toBeLessThan(1);
	}
});

test('what is read is not what is stored', async ({ page, context }) => {
	await context.grantPermissions(['clipboard-read', 'clipboard-write']);
	await theList(page);

	// The accessible name is the whole line, as typed, in the casing it was
	// typed in — the split is for the eye only.
	const row = page.getByRole('button', { name: '2x Tomatos 5,08', exact: true });
	await expect(row).toHaveAttribute('aria-label', '2x Tomatos 5,08');

	await fromMenu(page, 'Export');
	const exported = await page.evaluate(() => navigator.clipboard.readText());
	expect(exported).toContain('- [ ] 2x Tomatos 5,08');
	expect(exported).toContain('- [ ] Onions 5,90');
	expect(exported).not.toContain('TOMATOS');
});

test('a long name with a price does not push the sheet sideways', async ({ page }) => {
	await page.setViewportSize({ width: 320, height: 720 });
	await addTask(page, '12x Something rather long that has to wrap on a phone 1.234,56');

	await expect(total(page)).toHaveText('1234,56');
	expect(
		await page.evaluate(
			() => document.documentElement.scrollWidth > document.documentElement.clientWidth
		)
	).toBe(false);
});
