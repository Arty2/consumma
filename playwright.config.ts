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
	webServer: {
		command: 'pnpm run build && pnpm run preview',
		port: 4173,
		reuseExistingServer: !process.env.CI
	},
	use: { baseURL: 'http://localhost:4173' },
	projects: [
		{
			name: 'chromium',
			use: { ...devices['Desktop Chrome'], launchOptions: { executablePath } }
		}
	]
});
