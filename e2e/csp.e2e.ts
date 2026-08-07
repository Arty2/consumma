import { expect, test } from '@playwright/test';
import { openMenu } from './menu';

/*
 * The strict CSP is only worth having if the app still runs under it. Chrome
 * refuses innerHTML writes outright when require-trusted-types-for is set, and
 * Svelte writes its own templates that way — so a missing `trusted-types`
 * allow-listing shows up as a page that renders and then does nothing.
 *
 * These tests fail on any console error, which is what a CSP violation is.
 */

test('the app hydrates under the CSP with no violations', async ({ page }) => {
	const problems: string[] = [];

	page.on('console', (message) => {
		if (message.type() === 'error') problems.push(message.text());
	});
	page.on('pageerror', (error) => problems.push(error.message));

	await page.goto('/');
	await page.evaluate(() => localStorage.clear());
	await page.reload();

	// Proof of hydration: this only exists once the client has run.
	await expect(page.getByRole('button', { name: 'Add a task' })).toBeVisible();

	// And proof it is interactive, not merely painted.
	await page.getByRole('button', { name: 'Add a task' }).click();
	const input = page.getByRole('textbox', { name: 'New task' });
	await input.fill('Bread');
	await input.press('Enter');

	await expect(page.getByRole('checkbox', { name: 'Bread' })).toBeVisible();

	/*
	 * And the menu, which is most of the app's chrome and none of it prerendered.
	 * The panels were outside this test for a long time: an inline style there
	 * would only be refused once someone opened one.
	 */
	await openMenu(page);
	await expect(page.getByRole('button', { name: /^Sync now/ })).toBeVisible();
	await page.keyboard.press('Escape');

	expect(problems).toStrictEqual([]);
});

test('the policy names the directives that matter', async ({ page }) => {
	await page.goto('/');

	const csp = await page
		.locator('meta[http-equiv="content-security-policy"]')
		.getAttribute('content');

	expect(csp).toBeTruthy();
	expect(csp).toContain("default-src 'self'");
	expect(csp).toContain("connect-src 'self'");
	expect(csp).toContain("object-src 'none'");
	expect(csp).toContain("base-uri 'none'");
	expect(csp).toContain("form-action 'none'");
	expect(csp).toContain("require-trusted-types-for 'script'");
	expect(csp).toContain('trusted-types svelte-trusted-html');
	expect(csp).not.toContain('unsafe-inline');
	expect(csp).not.toContain('unsafe-eval');
});

test('the browser talks to nothing but its own origin', async ({ page }) => {
	const foreign: string[] = [];

	page.on('request', (request) => {
		const url = new URL(request.url());
		if (url.origin !== 'http://localhost:4173') foreign.push(request.url());
	});

	await page.goto('/');
	await expect(page.getByRole('button', { name: 'Add a task' })).toBeVisible();

	// No CDN fonts, no analytics, no third-party anything.
	expect(foreign).toStrictEqual([]);
});
