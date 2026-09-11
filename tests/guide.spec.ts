import { describe, expect, it } from 'vitest';
import { INVITE, invited, next, type Step } from '../src/lib/state/guide';

describe('invited', () => {
	it('reads the flag off the query', () => {
		expect(invited('?j')).toBe(true);
		expect(invited(`?${INVITE}`)).toBe(true);
	});

	it('takes the flag with a value, and with anything else beside it', () => {
		expect(invited('?j=')).toBe(true);
		expect(invited('?j=1')).toBe(true);
		expect(invited('?utm=x&j')).toBe(true);
	});

	it('is nobody arriving on an invitation otherwise', () => {
		expect(invited('')).toBe(false);
		expect(invited('?')).toBe(false);
		expect(invited('?join')).toBe(false);
		expect(invited('?jj')).toBe(false);
	});

	/*
	 * The whole point of the flag: it is not the code, and a link that somehow
	 * carried one would still not be read as one here. There is nowhere in this
	 * module for twelve hex characters to go.
	 */
	it('carries no value anybody could join with', () => {
		expect(invited('?j=5e6b7c1a93f2')).toBe(true);
		expect(new URLSearchParams('?j=5e6b7c1a93f2').get(INVITE)).toBe('5e6b7c1a93f2');
	});
});

describe('next', () => {
	it('does nothing at all when the guide is off', () => {
		for (const turn of ['opened', 'closed', 'coded', 'dropped'] as const) {
			expect(next(null, turn)).toBeNull();
		}
	});

	it('follows the burger into the panel', () => {
		expect(next('burger', 'opened')).toBe('code');
	});

	it('goes back to the burger when the paper turns back over', () => {
		expect(next('code', 'closed')).toBe('burger');
	});

	it('is spent by a code landing in the field', () => {
		expect(next('code', 'coded')).toBeNull();
	});

	it('is put away by hand from either step', () => {
		expect(next('burger', 'dropped')).toBeNull();
		expect(next('code', 'dropped')).toBeNull();
	});

	/* Opening, closing and opening again is somebody still looking for it. */
	it('survives a round trip through the panel', () => {
		let step: Step = 'burger';
		for (const turn of ['opened', 'closed', 'opened'] as const) step = next(step, turn);

		expect(step).toBe('code');
	});
});
