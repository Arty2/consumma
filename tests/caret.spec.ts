import { describe, expect, it } from 'vitest';
import { amountsIn } from '../src/lib/doc/amount';
import { fromEnd, placeOf, sourceEnd } from '../src/lib/doc/caret';
import { pieces } from '../src/lib/doc/links';

/*
 * Turning a point on the words back into a place in the task.
 *
 * What is tested here is the arithmetic over pieces, which is all of the
 * interesting part: the two functions that touch a document — `spotAt` and
 * `offsetIn` — are exercised against a real browser in e2e/sheet.e2e.ts,
 * because a DOM stood up in Node to satisfy them would only be testing the
 * stand-in.
 */

describe('placeOf', () => {
	it('reads straight through on a row drawn as it is stored', () => {
		const text = 'Bread and butter';
		const [words] = pieces(text);

		expect(placeOf(words, 0)).toBe(0);
		expect(placeOf(words, 6)).toBe(6);
		expect(placeOf(words, text.length)).toBe(text.length);
	});

	it('carries an offset past an address rather than through it', () => {
		/*
		 * The label is shorter than the address it stands for, so an offset in
		 * the words after a link is nowhere near the offset in the string unless
		 * the link's own length is added back.
		 */
		const text = 'Read https://heracl.es/projects/2024/consumma tonight';
		const parts = pieces(text);

		expect(parts).toHaveLength(3);
		expect(parts[1].kind).toBe('link');

		// Two characters into ' tonight', which is the piece after the address.
		expect(text.slice(placeOf(parts[2], 2)!)).toBe('onight');
	});

	it('puts a tap inside an address at the end of it', () => {
		const text = 'Read https://heracl.es/projects/2024/consumma tonight';
		const parts = pieces(text);

		expect(text.slice(placeOf(parts[1], 4)!)).toBe(' tonight');
	});

	it('measures an address as it was typed, not as it parsed', () => {
		/*
		 * `URL` normalises — a bare host gains a trailing slash — so the href is
		 * a character longer than what was written. Stepping over it by the href
		 * would put the caret one past where the sentence carries on.
		 */
		const text = 'See https://heracl.es then go';
		const parts = pieces(text);

		expect(parts[1].kind === 'link' && parts[1].href).toBe('https://heracl.es/');
		expect(text.slice(placeOf(parts[2], 0)!)).toBe(' then go');
	});

	it('never runs off the end of the piece it landed in', () => {
		const [words] = pieces('Bread');

		// A browser reporting an offset past the text it belongs to is clamped,
		// rather than producing a caret position the string does not have.
		expect(placeOf(words, 99)).toBe(5);
		expect(placeOf(words, -4)).toBe(0);
	});

	it('says so when there is no piece at that index', () => {
		expect(placeOf(undefined, 0)).toBeNull();
	});
});

describe('sourceEnd', () => {
	it('is the end of the words as written, not as drawn', () => {
		const text = 'See https://heracl.es/projects/2024/consumma';

		expect(sourceEnd(pieces(text))).toBe(text.length);
	});

	it('is nought when nothing is written', () => {
		expect(sourceEnd(pieces(''))).toBe(0);
	});
});

describe('fromEnd', () => {
	it('measures back from the last thing written', () => {
		const parts = pieces('Bread and butter');

		expect(fromEnd(parts, 16)).toBe(0);
		expect(fromEnd(parts, 13)).toBe(3);
		expect(fromEnd(parts, 0)).toBe(16);
	});

	it('never goes negative on an offset past the end', () => {
		expect(fromEnd(pieces('Bread'), 40)).toBe(0);
	});
});

describe('the name a row draws', () => {
	/*
	 * The other half of the same journey: on a row with a count or a price the
	 * words drawn are the name alone, so an offset into them has `nameAt` added
	 * to reach the task itself.
	 */
	it('starts past the count', () => {
		const text = '2x Tomatos 5,08';
		const reading = amountsIn(text);

		expect(reading.name).toBe('Tomatos');
		expect(reading.nameAt).toBe(3);
		expect(text.slice(reading.nameAt, reading.nameAt + reading.name.length)).toBe('Tomatos');
	});

	it('starts at nought when there is no count', () => {
		expect(amountsIn('Tomatos 5,08').nameAt).toBe(0);
	});

	it('is counted rather than looked up, so a repeat cannot mislead it', () => {
		// `indexOf('2')` would find the count. The name starts after it.
		const reading = amountsIn('2 2 2');

		expect(reading.name).toBe('2');
		expect(reading.nameAt).toBe(2);
	});

	it('holds for a row whose trailing figure turned out not to be a price', () => {
		// A currency mark on both sides is not a price, so the whole of the rest
		// is the name — and the offset has to be the whole of the rest's.
		const text = '2x Tea €5€';
		const reading = amountsIn(text);

		expect(reading.cost).toBeNull();
		expect(text.slice(reading.nameAt)).toBe(reading.name);
	});
});
