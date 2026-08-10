/**
 * What to do with a task that has been typed past its limit.
 *
 * The old answer was `maxlength`: the field simply stopped accepting
 * characters, which on a phone is indistinguishable from the keyboard having
 * died. A list is written in a hurry and a row that silently refuses the rest
 * of a sentence loses it.
 *
 * So the row fills up and the remainder starts the next one, the way a line
 * fills up and the next word goes to the next line. Nothing is discarded and
 * nothing is refused; the writing carries on one row down.
 *
 * Pure, and counted in code points like every other limit here, so an emoji
 * costs one character rather than two.
 */

import { length } from './clean';

export type Spill = {
	/** What stays on the row being typed in. Never longer than `max`. */
	head: string;
	/** What starts the next row. Never empty — otherwise there is no spill. */
	tail: string;
};

/**
 * Splits at the last space that leaves a full row behind, so a word travels
 * whole rather than being cut in half across two rows.
 *
 * A run of more than `max` characters with no space in it has nowhere better
 * to break, and is cut at the limit — a URL or a very long word, and breaking
 * it exactly is the honest thing. The space itself is dropped: it did its job
 * as a boundary and would otherwise open the next row with a blank.
 *
 * Returns null when the text is within the limit, which is the ordinary case
 * and the one worth being cheap.
 */
export function spill(text: string, max: number): Spill | null {
	if (max <= 0) return null;

	const points = [...text];
	if (points.length <= max) return null;

	// One past the limit, so a space sitting exactly on the boundary is found
	// and the row keeps its full complement of characters.
	const boundary = points.slice(0, max + 1).lastIndexOf(' ');

	/*
	 * The break has to leave something on both sides, or it is not a break.
	 *
	 * A run of spaces longer than the row finds its boundary on the very last
	 * character, and breaking there hands the next row nothing — which would
	 * spill forever, one empty row at a time. Falling through to the hard cut
	 * always leaves a tail, because the text is longer than the limit.
	 */
	if (boundary > 0 && boundary + 1 < points.length) {
		return {
			head: points.slice(0, boundary).join(''),
			tail: points.slice(boundary + 1).join('')
		};
	}

	return { head: points.slice(0, max).join(''), tail: points.slice(max).join('') };
}

/**
 * The same cut applied over and over, for text arriving all at once.
 *
 * Pasting four hundred characters into a row is not typing past the end of it,
 * but it is the same question, and answering it differently would mean a
 * paste losing what typing keeps. The first piece stays where it was pasted
 * and the rest become rows under it.
 */
export function spillAll(text: string, max: number): string[] {
	const rows: string[] = [];
	let rest = text;

	// Bounded by the fact that every pass moves at least one code point out of
	// `rest`, but written as a loop over a shrinking string rather than a
	// recursion, because a paste can be a whole document.
	for (;;) {
		const next = spill(rest, max);
		if (next === null) {
			rows.push(rest);
			return rows;
		}

		rows.push(next.head);
		rest = next.tail;
	}
}

/**
 * Whether a row is close enough to its limit to be worth saying so.
 *
 * The counter is not a warning — it is the last stretch of a page, and it
 * appears at the point where someone might want to choose their words rather
 * than find out afterwards where the row broke.
 */
export function nearLimit(text: string, max: number, within: number): boolean {
	return length(text) >= max - within;
}
