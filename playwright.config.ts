import { existsSync } from 'node:fs';
import { defineConfig, devices } from '@playwright/test';

/*
 * CI installs the Chromium build this Playwright pins. Some dev containers
 * ship a different one already; when that is the case, use it rather than
 * downloading a second copy of the same browser.
 */
const preinstalled = '/opt/pw-browsers/chromium';
const executablePath = !process.env.CI && existsSync(preinstalled) ? preinstalled : undefined;

export default defineConfig({
	testDir: 'e2e',
	testMatch: '**/*.e2e.{ts,js}',
	/*
	 * Tests within a file run in parallel too, not just files against each
	 * other. Nothing here shares state across tests: the sync suite answers its
	 * own requests in Node from a `FakeBlobs` map rebuilt per test, and workers
	 * are separate processes, so a test never sees another's room.
	 *
	 * Without this the suite was as slow as its longest file, which is the sync
	 * one — seventeen tests in a single lane.
	 */
	fullyParallel: true,
	workers: process.env.CI ? 4 : '50%',
	/*
	 * One retry on CI. Not a licence for flaky tests: it is cover for the real
	 * timing edges left in the suite, where a wait sits close to the interval it
	 * is waiting on. A retry that passes still shows up in the report as flaky.
	 */
	retries: process.env.CI ? 1 : 0,
	/*
	 * Never reused, on any machine.
	 *
	 * `!process.env.CI` meant that locally a preview server already listening on
	 * 4173 was adopted as-is — serving whatever build happened to be on disk
	 * when it started. Every failure then points at the wrong thing: the code
	 * under test is not the code being served, and the diff you are staring at
	 * is not in the bundle. Building and starting fresh costs a few seconds and
	 * removes a whole class of failure that looks exactly like a real one.
	 */
	webServer: {
		command: 'pnpm run build && pnpm run preview',
		port: 4173,
		reuseExistingServer: false
	},
	use: { baseURL: 'http://localhost:4173' },
	projects: [
		{
			name: 'chromium',
			use: { ...devices['Desktop Chrome'], launchOptions: { executablePath } }
		}
	]
});
