import { describe, expect, it } from 'vitest';
import { statusText } from '../src/lib/sync/status';

describe('statusText', () => {
	it('says everything is synced, without hedging', () => {
		expect(statusText('synced', 0)).toStrictEqual({
			headline: 'Everything is synced.',
			detail: null
		});
	});

	it('counts what is waiting, and says who cannot see it', () => {
		expect(statusText('pending', 1).headline).toBe('1 change is waiting to go.');
		expect(statusText('pending', 4).headline).toBe('4 changes are waiting to go.');
		expect(statusText('pending', 4).detail).toBe('Nobody else can see them until you sync.');
	});

	it('still counts what is waiting when the list cannot be reached', () => {
		// The old copy dropped the count whenever the connection was down, which
		// is when it matters most.
		expect(statusText('offline', 3).headline).toBe('3 changes are waiting to go.');
	});

	it('treats being unreachable as a condition, not a failure', () => {
		const { detail } = statusText('offline', 3);
		expect(detail).toContain('safe on this device');
		// Nothing that reads as an error: those go through sync.message.
		expect(detail).not.toMatch(/error|failed|couldn|problem/i);
	});

	it('does not tell someone to sync when syncing is what failed', () => {
		const { headline, detail } = statusText('pending', 2, true);

		expect(headline).toBe('2 changes are waiting to go.');
		// "Nobody else can see them until you sync" would be advice to do the
		// thing that just came back refused.
		expect(detail).not.toMatch(/until you sync/);
		expect(detail).toMatch(/server/);
	});

	it('separates a refused server from an unreachable one', () => {
		expect(statusText('pending', 1, true).detail).not.toBe(statusText('offline', 1).detail);
	});

	it('never leaves the headline empty, whatever the state', () => {
		for (const status of ['synced', 'pending', 'offline'] as const) {
			for (const unsent of [0, 1, 2, 99]) {
				for (const refused of [false, true]) {
					const { headline } = statusText(status, unsent, refused);
					expect(headline, `${status}/${unsent}/${refused}`).not.toBe('');
				}
			}
		}
	});

	it('does not claim a sync that never happened', () => {
		// Fresh device, empty list: "Everything is synced" would be a lie.
		expect(statusText('pending', 0).headline).toBe('Nothing is waiting to go.');
	});
});
