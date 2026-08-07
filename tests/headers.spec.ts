import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

/*
 * The response headers only exist on a deploy, so they are asserted against
 * the file that produces them. That catches the failure that actually happens
 * — someone editing vercel.json and dropping one — rather than requiring a
 * deploy to notice.
 *
 * They live in vercel.json rather than in a hook so they apply to static
 * assets too, which never pass through one.
 */

type Config = {
	headers: { source: string; headers: { key: string; value: string }[] }[];
	crons?: { path: string; schedule: string }[];
};

const config: Config = JSON.parse(readFileSync('vercel.json', 'utf8'));

function headersFor(source: string): Map<string, string> {
	const rule = config.headers.find((entry) => entry.source === source);
	if (!rule) throw new Error(`no header rule for ${source}`);
	return new Map(rule.headers.map((h) => [h.key, h.value]));
}

describe('response headers', () => {
	const everything = headersFor('/(.*)');

	it('pins HTTPS for two years, including subdomains', () => {
		expect(everything.get('Strict-Transport-Security')).toBe(
			'max-age=63072000; includeSubDomains; preload'
		);
	});

	it('never sends a referrer', () => {
		// This matters more than usual: nothing should ever carry a code into a
		// referrer, which is also why the code never goes in a URL at all.
		expect(everything.get('Referrer-Policy')).toBe('no-referrer');
	});

	it('refuses to be framed or sniffed', () => {
		expect(everything.get('X-Frame-Options')).toBe('DENY');
		expect(everything.get('X-Content-Type-Options')).toBe('nosniff');
	});

	it('isolates the origin', () => {
		expect(everything.get('Cross-Origin-Opener-Policy')).toBe('same-origin');
		expect(everything.get('Cross-Origin-Resource-Policy')).toBe('same-origin');
		expect(everything.get('Cross-Origin-Embedder-Policy')).toBe('require-corp');
	});

	it('turns off every device permission the app has no use for', () => {
		const policy = everything.get('Permissions-Policy') ?? '';

		for (const feature of [
			'camera',
			'microphone',
			'geolocation',
			'payment',
			'usb',
			'midi',
			'display-capture'
		]) {
			expect(policy, feature).toContain(`${feature}=()`);
		}
	});

	it('never lets an API response be cached', () => {
		expect(headersFor('/api/(.*)').get('Cache-Control')).toBe('no-store');
	});
});

describe('the daily sweep', () => {
	it('is scheduled once a day, which is what Hobby allows', () => {
		expect(config.crons).toHaveLength(1);
		expect(config.crons?.[0].path).toBe('/api/cron/sweep');
		// Five fields, and a fixed hour rather than an interval.
		expect(config.crons?.[0].schedule).toMatch(/^\d+ \d+ \* \* \*$/);
	});
});
