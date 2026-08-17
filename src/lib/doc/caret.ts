/*
 * Where in a task a finger landed.
 *
 * Tapping a task opens it for editing, and the caret goes where the tap was
 * rather than to the end — a person reaching into the middle of a sentence is
 * reaching for the middle of it. That is easy on a row drawn exactly as it is
 * stored, and every row with a count, a price or an address in it is not: the
 * count and the price are lifted out into cells of their own, and an address is
 * shown as what it points at rather than as every character of how to get there
 * (see doc/amount.ts and doc/links.ts, which do the reading).
 *
 * So what the browser reports — a node and an offset inside the drawn text —
 * has to be carried back through those readings to a place in the string. Both
 * of them already know where each part came from: `nameAt` on a Reading, and
 * `at` on a Piece. This is the arithmetic that uses them.
 *
 * The one place the answer is approximate is inside a link's label, and it
 * cannot be otherwise: `heracl.es/…/consumma` has fewer characters than the
 * address it stands for and there is no character-for-character correspondence
 * to find. A tap there puts the caret at the end of that address, which is
 * where somebody adding to the task would want it anyway.
 *
 * Split in two on purpose. Everything below `spotAt` is arithmetic over pieces
 * and is tested in tests/caret.spec.ts; `spotAt` and `offsetIn` are the two
 * that touch a document, and they are tested in a real browser by
 * e2e/sheet.e2e.ts, because a DOM stood up in Node to satisfy them would be
 * testing the stand-in.
 */

import { sourceLength, type Piece } from './links';

/** What the browser will say about a point, in the one shape both APIs agree on. */
export type Spot = { node: Node; offset: number };

/** The attribute each drawn piece carries: its index in the list it came from. */
export const PIECE = 'piece';

/**
 * The caret position under a point, asked of the document.
 *
 * `caretPositionFromPoint` is the standard and is what Firefox and current
 * Chrome answer to; `caretRangeFromPoint` is WebKit's older spelling and still
 * the only one Safari has. Neither is guaranteed, so a browser with no way to
 * answer says so rather than having a number guessed for it.
 */
export function spotAt(x: number, y: number): Spot | null {
	const doc = document as Document & {
		caretPositionFromPoint?: (x: number, y: number) => { offsetNode: Node; offset: number } | null;
		caretRangeFromPoint?: (x: number, y: number) => Range | null;
	};

	const position = doc.caretPositionFromPoint?.(x, y);
	if (position) return { node: position.offsetNode, offset: position.offset };

	const range = doc.caretRangeFromPoint?.(x, y);
	if (range) return { node: range.startContainer, offset: range.startOffset };

	return null;
}

/**
 * How far into the drawn words a spot is, or null if it is not in them at all.
 *
 * Each piece is rendered into an element of its own carrying its index, and the
 * spot is traced back up to whichever of those it landed in. Told by the markup
 * rather than worked out by counting children: an `{#each}` puts anchor
 * comments among its output, so the nth child is not the nth piece and never
 * was — it only looked like it for as long as every row had exactly one.
 *
 * A spot on the container itself rather than inside a piece is what a tap past
 * the last word reports, and that is the end of what is written.
 */
export function offsetIn(words: HTMLElement, spot: Spot, pieces: readonly Piece[]): number | null {
	if (spot.node === words) return sourceEnd(pieces);

	const from = spot.node instanceof Element ? spot.node : spot.node.parentElement;
	const holder = from?.closest<HTMLElement>(`[data-${PIECE}]`);
	if (!holder || !words.contains(holder)) return null;

	return placeOf(pieces[Number(holder.dataset[PIECE])], spot.offset);
}

/**
 * Where a piece and an offset into what it draws land in the task's own text.
 *
 * Undefined for a piece that is not there — an index out of a list that has
 * since been redrawn — which is a null rather than a place, so the caller falls
 * back to the end.
 */
export function placeOf(piece: Piece | undefined, offset: number): number | null {
	if (!piece) return null;

	/*
	 * Inside an address, the offset is into the label rather than into the
	 * address, and the two have no character in common past the host. The end
	 * of the address is the honest answer and the useful one.
	 */
	if (piece.kind === 'link') return piece.at + piece.raw.length;

	return piece.at + Math.max(0, Math.min(offset, piece.text.length));
}

/** Where the last piece stops, which is the end of the words as written. */
export function sourceEnd(pieces: readonly Piece[]): number {
	const last = pieces[pieces.length - 1];
	return last ? last.at + sourceLength(last) : 0;
}

/**
 * How near the end of the words a place is, in characters.
 *
 * A tap in the last stretch of a task is somebody reaching for the end of it —
 * to add to it, or to press Enter and start the next thing there — and the tap
 * ladder treats that as plainly meaning edit rather than as the first half of a
 * tick. Counted from the end of what is written rather than from the end of the
 * string, so a price at the back does not put the whole of the last word out of
 * reach.
 */
export function fromEnd(pieces: readonly Piece[], offset: number): number {
	return Math.max(0, sourceEnd(pieces) - offset);
}
