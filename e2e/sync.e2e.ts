import { expect, test, type Route } from '@playwright/test';
import { FakeBlobs } from '../tests/fakes';
import { openMenu, addTask } from './app';
import { RoomStore, isRoomId, parsePutBody } from '../src/lib/server/store';

/*
 * Two browsers on one code, converging. M5's acceptance, and the one part of
 * sync a unit test cannot reach: the real client running in a real browser,
 * doing its own crypto with a key it derived itself, over its own fetch.
 *
 * Requests are intercepted and answered here in Node by the real `RoomStore` —
 * real validation, real version checks, real conflicts. The route module builds
 * its own store at import time, so it cannot be pointed at a fake from here;
 * `tests/route.spec.ts` is what pins the handlers to the contract answered
 * below, and the two together cover the path end to end.
 *
 * What none of it proves is that @vercel/blob behaves like the fake. Nothing
 * short of a deploy can; see the README.
 */

/** One store behind both browsers, exactly as one Blob store would be. */
let blobs: FakeBlobs;
let store: RoomStore;
/** Every body that crossed the wire, so a test can look at what was sent. */
let sent: string[];

async function api(route: Route) {
	const request = route.request();
	const roomId = new URL(request.url()).pathname.replace('/api/room/', '');
	const headers = { 'cache-control': 'no-store' };

	if (!isRoomId(roomId)) return route.fulfill({ status: 404, headers });

	if (request.method() === 'GET') {
		const result = await store.read(roomId, request.headers()['if-none-match'] ?? null);

		if (result.status === 'missing') return route.fulfill({ status: 404, headers });
		if (result.status === 'unchanged') {
			return route.fulfill({ status: 304, headers: { ...headers, etag: result.etag } });
		}
		return route.fulfill({
			status: 200,
			headers: { ...headers, etag: result.etag, 'content-type': 'application/json' },
			body: JSON.stringify({ v: result.room.v, blob: result.room.blob })
		});
	}

	const raw = request.postData() ?? '';
	sent.push(raw);

	const body = parsePutBody(JSON.parse(raw));
	if (!body) return route.fulfill({ status: 400, headers });

	const result = await store.write(roomId, body);

	if (result.status === 'too-large') return route.fulfill({ status: 413, headers });
	if (result.status === 'conflict') {
		return route.fulfill({
			status: 409,
			headers: { ...headers, 'content-type': 'application/json' },
			body: JSON.stringify({ v: result.room.v, blob: result.room.blob })
		});
	}

	return route.fulfill({
		status: 200,
		headers: { ...headers, 'content-type': 'application/json' },
		body: JSON.stringify({ v: result.v })
	});
}

/**
 * A browser on `code`, with its own client id and its own derived key.
 *
 * The code is planted before the app loads rather than typed into JOIN, which
 * is what JOIN does to storage anyway. Doing it through the panel costs a
 * forced sync and then a ten-second cooldown before the test can sync again,
 * three times over; the join path has its own test below.
 */
async function device(page: Page, code: string) {
	await page.route('**/api/room/**', api);
	await page.goto('/');
	await page.evaluate(
		(value) => {
			localStorage.clear();
			localStorage.setItem('consumma:code', value);
		},
		code.replace(/\s/g, '')
	);
	await page.reload();

	await expect(page.getByRole('button', { name: 'Add a task' }).first()).toBeVisible();
}

async function syncNow(page: Page) {
	await openMenu(page);
	const button = page.getByRole('button', { name: /^Sync now/ });
	// The cooldown is ten seconds and this is the same device twice over.
	await expect(button).toBeEnabled({ timeout: 15_000 });
	await button.click();
	await expect(page.getByText('Everything is synced.')).toBeVisible();
	await page.keyboard.press('Escape');
}

/* Each sync waits out the ten-second cooldown, so these are not quick. */
test.describe.configure({ timeout: 120_000 });

test.beforeEach(() => {
	blobs = new FakeBlobs();
	store = new RoomStore(blobs, { cacheMs: 0 });
	sent = [];
});

test('two browsers on one code end up with the same list', async ({ browser }) => {
	const code = '1234 5678 9abc';

	const one = await browser.newPage();
	const two = await browser.newPage();

	await device(one, code);
	await device(two, code);

	await addTask(one, 'Bread');
	await syncNow(one);

	// The second device has never seen this task.
	await expect(two.getByRole('checkbox', { name: 'Bread' })).toHaveCount(0);

	await syncNow(two);
	await expect(two.getByRole('checkbox', { name: 'Bread' })).toBeVisible();

	// And back the other way, on top of what is already there.
	await addTask(two, 'Milk');
	await syncNow(two);
	await syncNow(one);

	for (const page of [one, two]) {
		await expect(page.getByRole('checkbox', { name: 'Bread' })).toBeVisible();
		await expect(page.getByRole('checkbox', { name: 'Milk' })).toBeVisible();
	}

	await one.close();
	await two.close();
});

test('what crosses the wire is ciphertext and nothing else', async ({ browser }) => {
	const code = 'fedc ba98 7654';

	const page = await browser.newPage();
	await device(page, code);
	await addTask(page, 'Something private');
	await syncNow(page);

	expect(sent.length).toBeGreaterThan(0);
	for (const body of sent) {
		expect(body).not.toContain('Something private');
		// The two fields the server is allowed to see, and no third.
		expect(Object.keys(JSON.parse(body)).sort()).toStrictEqual(['baseV', 'blob']);
	}

	// The code itself never leaves the browser, in any form.
	for (const body of sent) expect(body.replace(/\s/g, '')).not.toContain('fedcba987654');

	await page.close();
});

test('both edited apart, then both synced, and nothing is lost', async ({ browser }) => {
	const code = '0f0f 1e1e 2d2d';

	const one = await browser.newPage();
	const two = await browser.newPage();
	await device(one, code);
	await device(two, code);

	// Neither has seen the other's edit when they make it.
	await addTask(one, 'From one');
	await addTask(two, 'From two');

	await syncNow(one);
	await syncNow(two);
	await syncNow(one);

	for (const page of [one, two]) {
		await expect(page.getByRole('checkbox', { name: 'From one' })).toBeVisible();
		await expect(page.getByRole('checkbox', { name: 'From two' })).toBeVisible();
	}

	await one.close();
	await two.close();
});

test('joining a list finishes, and says so by closing', async ({ page }) => {
	/*
	 * A regression test with a story. Completing a join used to throw
	 * effect_update_depth_exceeded — the mount effect wrote the state it read
	 * through `unsent`, and Svelte tore the tree's reactivity down. The sync
	 * itself worked, so the code changed and the status said "Everything is
	 * synced", but the panel stopped responding: it sat there with the code
	 * still typed in, no error, and no way to tell anything had happened.
	 *
	 * Nothing in the suite completed a join, so nothing caught it.
	 */
	const problems: string[] = [];
	page.on('pageerror', (error) => problems.push(error.message));

	await page.route('**/api/room/**', api);
	await page.goto('/');
	await page.evaluate(() => localStorage.clear());
	await page.reload();

	await openMenu(page);
	await page.getByRole('textbox', { name: 'Code' }).fill('1234 5678 9abc');
	await page.getByRole('button', { name: 'Join' }).click();

	// Closing is how a join reports success, so it is the whole assertion.
	await expect(page.getByRole('dialog', { name: 'Menu' })).toHaveCount(0);
	expect(problems).toStrictEqual([]);

	// And the list it joined is the one it is now on.
	await openMenu(page);
	await expect(page.getByText('1234 5678 9abc')).toBeVisible();
});

test('the code is typed into twelve places, one underline each', async ({ page }) => {
	await page.route('**/api/room/**', api);
	await page.goto('/');
	await page.evaluate(() => localStorage.clear());
	await page.reload();
	await openMenu(page);

	const field = page.locator('.field');
	// One place per character of the code, each with its own drawn rule.
	await expect(field.locator('.cell')).toHaveCount(12);
	await expect(field.locator('svg.under path')).toHaveCount(12);

	// The same face and size as the code it is compared against.
	const shown = await page.locator('.code').evaluate((el) => {
		const style = getComputedStyle(el);
		return [style.fontFamily, style.fontSize].join(' ');
	});
	const typed = await field
		.locator('.glyph')
		.first()
		.evaluate((el) => {
			const style = getComputedStyle(el);
			return [style.fontFamily, style.fontSize].join(' ');
		});
	expect(typed).toBe(shown);

	// Typed in capitals, because a code read aloud often is.
	await page.getByRole('textbox', { name: 'Code' }).fill('ED43 A066 78E0');

	/*
	 * Whitespace is not a place, and neither is case: the code is lower case, so
	 * showing capitals back would put the two codes on this panel in different
	 * cases — the one thing sharing a face and a size was meant to avoid.
	 */
	const places = await field.locator('.glyph').allInnerTexts();
	expect(places.join('')).toBe('ed43a06678e0');
});

test('a while after a sync, the button offers one rather than counting', async ({ page }) => {
	await page.clock.install();
	await page.route('**/api/room/**', api);
	await page.goto('/');
	await page.evaluate(() => {
		localStorage.clear();
		localStorage.setItem('consumma:code', '123456789abc');
	});
	await page.reload();

	await page.getByRole('button', { name: /^Sync —/ }).click();
	// Nothing is waiting and it just synced, so there is nothing to offer.
	await expect(page.getByRole('button', { name: /^Sync —/ })).toHaveCount(0);

	/*
	 * Nothing syncs on its own, so a list left open all morning is exactly as
	 * old as when it was opened. Ten minutes on, the button comes back — as a
	 * circular arrow, because there is nothing to send, only something to fetch.
	 */
	await page.clock.fastForward('11:00');

	const offered = page.getByRole('button', { name: /^Sync —/ });
	await expect(offered).toBeVisible();
	await expect(offered).toHaveAttribute('aria-label', /not synced for a while/);
});

test('the corner sync button says when it could not sync', async ({ page }) => {
	/*
	 * The menu shows `sync.message` in an alert, but this button exists so that
	 * syncing does not need the menu — so a failure had nowhere to go. Tapping it
	 * against a dead server did nothing at all, which is how a broken deployment
	 * came to look like an idle one.
	 */
	await page.route('**/api/room/**', (route) => route.abort());
	await page.goto('/');
	await page.evaluate(() => localStorage.clear());
	await page.reload();

	await page.getByRole('button', { name: /^Sync —/ }).click();

	const toast = page.getByRole('status').filter({ hasText: /reach/i });
	await expect(toast).toBeVisible();

	// And nothing was lost saying so.
	await expect(page.getByRole('button', { name: 'Add a task' }).first()).toBeVisible();
});
