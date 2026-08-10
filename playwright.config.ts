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
