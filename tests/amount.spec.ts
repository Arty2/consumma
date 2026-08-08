import fc from 'fast-check';
import { describe, expect, it } from 'vitest';
import {
	amountsIn,
	format,
	groupTotal,
	hasAmounts,
	total,
	type Money
} from '../src/lib/doc/amount';
import type { State } from '../src/lib/doc/types';

/*
 * The rule that carries the most weight here is that both `,` and `.` are
 * decimal separators — people write both, often in the same list — and that
 * thousands are still readable, because the digit pattern says which is which.
 * Get that wrong in one direction and a €5,08 tomato costs five hundred and
 * eight; wrong in the other and a 1,200 count of something becomes €12.
 */

const cost = (text: string) => amountsIn(text).money;
const cents = (text: string) => cost(text)?.cents ?? null;

describe('reading a price', () => {
	it('takes one or two digits behind the mark as a decimal point', () => {
		expect(cents('Tomatos 5,08')).toBe(508);
		expect(cents('Tomatos 5.08')).toBe(508);
		expect(cents('Tomatos 20.00')).toBe(2000);
		expect(cents('Tomatos 5.9')).toBe(590);
		expect(cents('Tomatos 5,9')).toBe(590);
	});

	it('takes exactly three behind the mark as a grouped thousand', () => {
		expect(cents('Beams 1,234')).toBe(123400);
		expect(cents('Beams 1.234')).toBe(123400);
		expect(cents('Beams 1.500')).toBe(150000);
	});

	it('lets the last mark decide when a number carries both', () => {
		expect(cents('Beams 1.234,56')).toBe(123456);
		expect(cents('Beams 1,234.56')).toBe(123456);
		expect(cents('Beams 1.234.567')).toBe(123456700);
	});

	it('refuses what is neither', () => {
		// Four digits behind the mark is not a decimal and not a thousand.
		expect(cost('Tomatos 5,0812')).toBeNull();
		// A grouped number leads with one to three digits, not five.
		expect(cost('Beams 12345,678')).toBeNull();
		// One mark cannot group and point at once.
		expect(cost('Beams 1,234,56')).toBeNull();
		expect(cost('Tomatos 5,')).toBeNull();
	});

	it('keeps a whole number whole', () => {
		const money = cost('Leeks 10');
		expect(money).toStrictEqual({ cents: 1000, separator: null, decimals: 0, currency: null });
	});

	it('remembers which mark was written, and how many places', () => {
		expect(cost('Onions 5,90')).toStrictEqual({
			cents: 590,
			separator: ',',
			decimals: 2,
			currency: null
		});
		expect(cost('Onions 5.9')).toStrictEqual({
			cents: 590,
			separator: '.',
			decimals: 1,
			currency: null
		});
	});

	it('is only a price at the end, behind a space', () => {
		expect(cost('5,08 tomatos')).toBeNull();
		expect(cost('Tomatos5,08')).toBeNull();
	});

	it('is a name when there is no name left over', () => {
		expect(cost('5,08')).toBeNull();
		expect(amountsIn('5,08').name).toBe('5,08');
	});
});

describe('a currency mark', () => {
	it('counts on either side of the number', () => {
		expect(cost('Bread €1.20')?.currency).toBe('€');
		expect(cost('Wine 8,50€')?.currency).toBe('€');
		expect(cost('Beer $4')?.currency).toBe('$');
		expect(cost('Tea 3£')?.currency).toBe('£');
	});

	it('is kept in the cost exactly as written', () => {
		expect(amountsIn('Bread €1.20').cost).toBe('€1.20');
		expect(amountsIn('Wine 8,50€').cost).toBe('8,50€');
	});

	it('does not count on both sides at once', () => {
		expect(cost('Bread €1.20€')).toBeNull();
	});
});

describe('reading a count', () => {
	it('takes a number at the front, with or without an x', () => {
		expect(amountsIn('2x Tomatos').amount).toBe('2x');
		expect(amountsIn('3 Potatos').amount).toBe('3');
		expect(amountsIn('2 x Tomatos').amount).toBe('2 x');
		expect(amountsIn('1.5x Milk').amount).toBe('1.5x');
		expect(amountsIn('2× Tomatos').amount).toBe('2×');
	});

	it('needs a space after it, so a word is left whole', () => {
		expect(amountsIn('2xTomatos').amount).toBeNull();
		expect(amountsIn('2x').amount).toBeNull();
	});

	it('does not read units, only counts', () => {
		// `500g` is one word; the count is `500` only when the g is not attached.
		expect(amountsIn('500g Butter').amount).toBeNull();
		expect(amountsIn('2L Milk').amount).toBeNull();
	});

	it('reads a bare leading number wherever it finds one', () => {
		// The cost of the rule being simple: this is a count of days off.
		expect(amountsIn('2 days off').amount).toBe('2');
	});
});

describe('a task with both', () => {
	it('splits into count, name and price', () => {
		expect(amountsIn('2x Tomatos 20.00')).toStrictEqual({
			amount: '2x',
			name: 'Tomatos',
			cost: '20.00',
			money: { cents: 2000, separator: '.', decimals: 2, currency: null }
		});
	});

	it('leaves a task with neither alone', () => {
		expect(amountsIn('Bread')).toStrictEqual({
			amount: null,
			name: 'Bread',
			cost: null,
			money: null
		});
	});
});

describe('the total', () => {
	const money = (text: string): Money => {
		const read = cost(text);
		if (read === null) throw new Error(`no price in ${text}`);
		return read;
	};

	it('is nothing when nothing was counted', () => {
		expect(total([])).toBeNull();
	});

	it('follows the mark the rows used most, and the dot on a tie', () => {
		expect(total([money('a 1,00'), money('a 2,00'), money('a 3.00')])?.separator).toBe(',');
		expect(total([money('a 1,00'), money('a 2.00')])?.separator).toBe('.');
		expect(total([money('a 1'), money('a 2')])?.separator).toBe('.');
	});

	it('shows decimals only when a counted price had them', () => {
		expect(format(total([money('a 10'), money('a 20')])!)).toBe('30');
		expect(format(total([money('a 5,08'), money('a 20')])!)).toBe('25,08');
		expect(format(total([money('a 5,9'), money('a 20')])!)).toBe('25,90');
		expect(format(total([money('a 20.00'), money('a 10')])!)).toBe('30.00');
	});

	it('carries a currency mark the rows agree on, after the number', () => {
		expect(format(total([money('a €5,00'), money('a €2,50')])!)).toBe('7,50€');
		// Some wrote one and some did not; the ones that did agree.
		expect(format(total([money('a €5,00'), money('a 2,50')])!)).toBe('7,50€');
	});

	it('shows no mark when the rows disagree', () => {
		expect(format(total([money('a €5,00'), money('a $2,50')])!)).toBe('7,50');
	});

	it('does not drift over prices a float would round', () => {
		const rows = Array.from({ length: 10 }, () => money('a 0,10'));
		expect(format(total(rows)!)).toBe('1,00');
	});
});

describe('a group', () => {
	const task = (text: string, state: State = 'todo') => ({ text, state });

	it('totals the sheet from the note', () => {
		expect(
			groupTotal([
				task('2x Tomatos 5,08'),
				task('3 Potatos 20.00'),
				task('Onions 5,90'),
				task('5 Leeks 10', 'done')
			])
		).toBe('30,98');
	});

	it('counts half in full and done not at all', () => {
		const rows = [task('Bread 10'), task('Milk 20')];
		expect(groupTotal(rows)).toBe('30');
		expect(groupTotal([task('Bread 10'), task('Milk 20', 'half')])).toBe('30');
		expect(groupTotal([task('Bread 10'), task('Milk 20', 'done')])).toBe('10');
	});

	it('shows nothing when there is nothing to total', () => {
		expect(groupTotal([])).toBeNull();
		expect(groupTotal([task('Bread'), task('Milk')])).toBeNull();
		expect(groupTotal([task('Bread 10', 'done')])).toBeNull();
	});

	it('knows whether to keep space for a count', () => {
		expect(hasAmounts([task('Bread'), task('2x Milk')])).toBe(true);
		expect(hasAmounts([task('Bread'), task('Milk 5,00')])).toBe(false);
		expect(hasAmounts([])).toBe(false);
	});
});

/*
 * The two properties that matter. A total that depended on the order of the
 * rows would change when one was dragged, and a reading that dropped a
 * character would show the person something other than what they typed.
 */

const arbMoney: fc.Arbitrary<Money> = fc.record({
	cents: fc.integer({ min: 0, max: 10_000_000 }),
	separator: fc.constantFrom(',' as const, '.' as const, null),
	decimals: fc.constantFrom(0, 1, 2),
	currency: fc.constantFrom('€' as const, '$' as const, '£' as const, null)
});

describe('properties', () => {
	it('totals the same whatever order the rows are in', () => {
		fc.assert(
			fc.property(fc.array(arbMoney, { maxLength: 20 }), (rows) => {
				expect(total([...rows].reverse())).toStrictEqual(total(rows));
				// And a rotation, which reverse alone would not catch on a palindrome.
				expect(total([...rows.slice(1), ...rows.slice(0, 1)])).toStrictEqual(total(rows));
			}),
			{ numRuns: 300 }
		);
	});

	it('never loses a character of what was typed', () => {
		const arbAmount = fc.constantFrom('2x', '3', '1.5x', '2 x', '12×');
		const arbName = fc.constantFrom('Tomatos', 'Red onions', 'Bread', '5 a day');
		const arbCost = fc.constantFrom('5,08', '20.00', '10', '€1.20', '8,50€', '1.234,56');

		fc.assert(
			fc.property(
				fc.option(arbAmount, { nil: undefined }),
				arbName,
				fc.option(arbCost, { nil: undefined }),
				(amount, name, cost) => {
					const text = [amount, name, cost].filter((part) => part !== undefined).join(' ');
					const read = amountsIn(text);
					expect(
						[read.amount, read.name, read.cost].filter((part) => part !== null).join(' ')
					).toBe(text);
				}
			),
			{ numRuns: 300 }
		);
	});
});
