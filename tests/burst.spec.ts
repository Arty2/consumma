import { describe, expect, it } from 'vitest';
import { Burst, BURST_COUNT, BURST_WITHIN } from '../src/lib/state/burst';

/*
 * The clock is an argument, so the window can be held still here rather than
 * waited out. Every test below is the same shop trip at a different speed.
 */
describe('Burst', () => {
	it('says nothing until there are enough of them', () => {
		const burst = new Burst();

		expect(burst.note('a', 0)).toBeNull();
		expect(burst.note('b', 100)).toBeNull();
		expect(burst.note('c', 200)).toEqual(['a', 'b', 'c']);
	});

	it('needs them close together', () => {
		const burst = new Burst();

		burst.note('a', 0);
		burst.note('b', 100);
		// Far enough out that the first two are no longer part of anything.
		expect(burst.note('c', BURST_WITHIN + 200)).toBeNull();
	});

	it('drops what has gone stale rather than the whole run', () => {
		const burst = new Burst();

		burst.note('a', 0);
		burst.note('b', BURST_WITHIN - 100);
		burst.note('c', BURST_WITHIN + 100);

		// `a` has aged out; `b` and `c` are still a run, so one more makes three.
		expect(burst.note('d', BURST_WITHIN + 200)).toEqual(['b', 'c', 'd']);
	});

	it('counts a task once, however often it is ticked', () => {
		const burst = new Burst();

		expect(burst.note('a', 0)).toBeNull();
		expect(burst.note('a', 100)).toBeNull();
		expect(burst.note('a', 200)).toBeNull();
		expect(burst.note('b', 300)).toBeNull();
		expect(burst.note('c', 400)).toEqual(['a', 'b', 'c']);
	});

	it('asks once per run, not once per tick after it', () => {
		const burst = new Burst();

		burst.note('a', 0);
		burst.note('b', 100);
		expect(burst.note('c', 200)).toHaveLength(BURST_COUNT);

		// The fourth is the start of the next run, not the end of the last one.
		expect(burst.note('d', 300)).toBeNull();
	});

	it('forgets the run when something other than a tick happens', () => {
		const burst = new Burst();

		burst.note('a', 0);
		burst.note('b', 100);
		burst.forget();
		expect(burst.note('c', 200)).toBeNull();
	});
});
