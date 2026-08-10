import { describe, expect, it } from 'vitest';
import fc from 'fast-check';
import { length } from '../src/lib/doc/clean';
import { nearLimit, spill, spillAll } from '../src/lib/doc/spill';

describe('spill', () => {
	it('leaves text within the limit alone', () => {
		expect(spill('MILK', 10)).toBeNull();
		expect(spill('MILK AND BR', 11)).toBeNull();
	});

	it('breaks at the last space that leaves a full row behind', () => {
		expect(spill('MILK BREAD CHEESE', 12)).toStrictEqual({
			head: 'MILK BREAD',
			tail: 'CHEESE'
		});
	});

	it('takes a space sitting exactly on the boundary', () => {
		// Eleven characters then a space: the row can hold all eleven.
		expect(spill('MILK BREAD CHEESE', 10)).toStrictEqual({
			head: 'MILK BREAD',
			tail: 'CHEESE'
		});
	});

	it('drops the space it broke at, so the next row does not open with one', () => {
		const result = spill('AAAA BBBB', 5);
		expect(result?.tail.startsWith(' ')).toBe(false);
	});

	it('cuts a long unbroken run exactly at the limit', () => {
		expect(spill('AAAAAAAAAA', 4)).toStrictEqual({ head: 'AAAA', tail: 'AAAAAA' });
	});

	it('does not break at a leading space, which would leave an empty row', () => {
		expect(spill(' AAAAAAAAA', 4)).toStrictEqual({ head: ' AAA', tail: 'AAAAAA' });
	});

	it('does not break where the break would leave nothing behind', () => {
		// Five spaces in a row four long: the last space is the boundary, and
		// taking it would hand the next row nothing and spill forever.
		expect(spill('     ', 4)).toStrictEqual({ head: '    ', tail: ' ' });
	});

	it('counts code points, so an emoji costs one character', () => {
		// Four emoji is four characters, and a limit of two cuts between them
		// rather than through a surrogate pair.
		const result = spill('👍👍👍👍', 2);
		expect(result).toStrictEqual({ head: '👍👍', tail: '👍👍' });
	});

	it('never returns an empty tail, and never a head past the limit', () => {
		fc.assert(
			fc.property(fc.string(), fc.integer({ min: 1, max: 20 }), (text, max) => {
				const result = spill(text, max);
				expect(result === null || (result.tail !== '' && length(result.head) <= max)).toBe(true);
			})
		);
	});
});

describe('spillAll', () => {
	it('gives one row back when there is nothing to spill', () => {
		expect(spillAll('MILK', 10)).toStrictEqual(['MILK']);
	});

	it('cuts a paste into as many rows as it takes', () => {
		expect(spillAll('AAAA BBBB CCCC DDDD', 9)).toStrictEqual(['AAAA BBBB', 'CCCC DDDD']);
	});

	it('terminates on a long unbroken run', () => {
		expect(spillAll('A'.repeat(10), 3)).toStrictEqual(['AAA', 'AAA', 'AAA', 'A']);
	});

	it('always terminates, with every row inside the limit', () => {
		fc.assert(
			fc.property(fc.string({ minLength: 1 }), fc.integer({ min: 1, max: 12 }), (text, max) => {
				const rows = spillAll(text, max);
				expect(rows.every((row) => length(row) <= max)).toBe(true);
			})
		);
	});
});

describe('nearLimit', () => {
	it('is quiet until the last stretch', () => {
		expect(nearLimit('A'.repeat(179), 200, 20)).toBe(false);
		expect(nearLimit('A'.repeat(180), 200, 20)).toBe(true);
	});
});
