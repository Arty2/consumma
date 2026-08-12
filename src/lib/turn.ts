/*
 * Turning the paper by hand.
 *
 * The sheet and the panel are two sides of one receipt, and each is turned out
 * of the way by dragging the other into view. The arithmetic is the same on
 * both sides, so it lives here rather than twice: how far a drag has turned the
 * paper, where the axis has wandered to, and whether letting go finishes the
 * turn or lets it swing back.
 *
 * Which way each side turns is not decided here. The sheet goes one way and the
 * panel the other, because together they are one rotation carrying on in one
 * direction, and only the caller knows which half it is.
 */

/**
 * A quarter turn, which is as far as either side ever goes.
 *
 * Past it the paper would be seen from behind, and neither side's words are
 * mirrored — see the keyframes in Menu.svelte.
 */
export const QUARTER = 90;

/**
 * How far the axis wanders from the middle at the end of a full drag, as a
 * percentage of the paper's width.
 *
 * A sheet spun in the hand is not held in a vice: the point it turns about
 * gives a little with the push and settles back afterwards. Small, because past
 * a few percent it stops reading as give and starts reading as the paper
 * sliding sideways, which is the thing the turn replaced.
 */
export const DRIFT = 9;

/**
 * Slack before the paper moves at all.
 *
 * A tap on a phone is never perfectly still, and without this the paper twitches
 * under every one of them.
 */
export const SLACK = 6;

/** How much of the paper's width a drag has covered, from 0 to 1. */
export function progress(travelled: number, width: number): number {
	if (!(width > 0)) return 0;
	return Math.min(1, Math.max(0, travelled - SLACK) / width);
}

/**
 * The angle a drag has turned the paper to, in degrees.
 *
 * `sign` is which way this side of the paper goes: the sheet turns one way to
 * show the panel, the panel the other to show the sheet back.
 */
export function angleAt(travelled: number, width: number, sign: 1 | -1): number {
	return progress(travelled, width) * QUARTER * sign;
}

/** Where the axis has wandered to, as a percentage across the paper. */
export function axisAt(travelled: number, width: number): number {
	return 50 + progress(travelled, width) * DRIFT;
}

/**
 * Whether letting go here finishes the turn rather than swinging back.
 *
 * A quarter of the paper's width, or a flick. The flick is counted in pixels
 * and milliseconds rather than as a fraction, because a flick is a movement of
 * the hand and a hand does not know how wide the paper is.
 */
export function commits(travelled: number, elapsed: number, width: number): boolean {
	const flick = travelled > 40 && elapsed < 250;
	return flick || travelled > width * 0.25;
}
