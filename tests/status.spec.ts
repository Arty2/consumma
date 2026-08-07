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

	it('never leaves the headline empty, whatever the state', () => {
		for (const status of ['synced', 'pending', 'offline'] as const) {
			for (const unsent of [0, 1, 2, 99]) {
				expect(statusText(status, unsent).headline, `${status}/${unsent}`).not.toBe('');
			}
		}
	});

	it('does not claim a sync that never happened', () => {
		// Fresh device, empty list: "Everything is synced" would be a lie.
		expect(statusText('pending', 0).headline).toBe('Nothing is waiting to go.');
	});
});
