import { generateKeyBetween } from 'fractional-indexing';

/**
 * Fractional index strings. Reordering one item must not restamp its
 * neighbours, which is the whole reason for not using integer positions.
 */

/**
 * A key strictly between two neighbours, either of which may be absent at the
 * ends of a list.
 *
 * `generateKeyBetween` throws if the keys are equal or out of order, which a
 * merged document can produce: two devices can independently land a task in
 * the same slot. That is a display-ordering nuisance, not data loss, so fall
 * back to appending rather than letting a drag throw.
 */
export function between(before: string | null, after: string | null): string {
	try {
		return generateKeyBetween(before, after);
	} catch {
		return generateKeyBetween(before ?? after, null);
	}
}

/** The key for a new item at the end of a list. */
export function last(keys: readonly string[]): string {
	const sorted = [...keys].sort(compare);
	return between(sorted.at(-1) ?? null, null);
}

export function compare(a: string, b: string): number {
	return a < b ? -1 : a > b ? 1 : 0;
}

/** Ties on the fractional index fall back to id, so ordering is total. */
export function byOrder<T extends { order: string; id: string }>(a: T, b: T): number {
	return compare(a.order, b.order) || compare(a.id, b.id);
}
