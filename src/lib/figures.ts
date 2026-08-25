/**
 * A figure the app has recognised, set as a figure.
 *
 * The count at the front of a task, the price at the back, the group's total
 * and the count of what is left in a row being typed are all drawn in the
 * fullwidth digits — ０１２３４５６７８９ — rather than in the ordinary ones.
 * They are drawn one em wide apiece, so a column of prices lines down without
 * being asked to, and they are unmistakably figures beside a handwritten face
 * without borrowing a second face's personality to say so.
 *
 * This is a change of drawing and not of reading: nothing here touches what is
 * stored, exported, read aloud or merged. `amountsIn` and `format` go on
 * speaking in ordinary digits, and the substitution happens at the four places
 * a figure reaches the screen.
 */

/** `0`–`9` are contiguous in both, so the whole map is one offset. */
const WIDE = 0xff10 - 0x30;

/**
 * Digits only.
 *
 * Not the currency: there is no fullwidth `€`, so widening `＄` and `￡` alone
 * would leave the column disagreeing with itself over which of the three it
 * was written in.
 *
 * Not the decimal mark either, though `，` and `．` both exist. A fullwidth
 * comma is a comma sitting in the middle of an em, so it opens a gap on either
 * side of itself and `5，08` reads as two numbers with a mark stranded between
 * them. A decimal mark's whole job is to bind the two halves, and the ordinary
 * one does it — the same reason the `×` stays as it is.
 */
export function wide(text: string): string {
	return text.replace(/[0-9]/g, (digit) => String.fromCodePoint(digit.codePointAt(0)! + WIDE));
}
