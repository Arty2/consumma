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
export const SLACK = 4;

/**
 * The most the paper ever slides before it begins to turn, in pixels.
 *
 * A sheet pushed sideways goes sideways first. It only starts to come round
 * once it has run out of slide — a hand does not spin a receipt from the
 * instant it touches it, and rotation that begins on the first pixel reads as
 * a mechanism rather than as paper.
 */
export const LEAD = 22;

/**
 * How far the paper may slide, given the room between its edge and the screen.
 *
 * It never slides off. On a phone the paper is drawn almost to the edges, so
 * the room is a few pixels and the slide is barely a nudge before the turn
 * takes over; on a wide screen there is more room than the lead-in wants and
 * `LEAD` is what decides. Either way the paper stops where the screen does,
 * and it is running out of room that starts it turning.
 */
export function leadFor(room: number): number {
	if (!(room > 0)) return 0;
	return Math.min(LEAD, room);
}

/**
 * How much further the hand has to go, once the paper has run out of slide,
 * before it starts to come round.
 *
 * The paper is against the screen and pushing it harder does nothing for a
 * moment — which is what pushing a sheet that has nowhere left to go feels
 * like, and what makes the turn read as something the paper gives in to rather
 * than as the next thing on a scale. It buys back the resistance the lead-in
 * spends, without letting the paper slide any further to get it.
 */
export const OVER = 14;

/** How far the paper has slid, in pixels: the lead-in, before any turn. */
export function slideAt(travelled: number, lead: number): number {
	return Math.min(Math.max(0, lead), Math.max(0, travelled - SLACK));
}

/**
 * How much of the paper's width the turn has covered, from 0 to 1.
 *
 * Counted from the end of the lead-in and the overdrag past it, so the paper is
 * flat for as long as it is only sliding and for the push that follows — and so
 * is the weight of its near edge, which is a reading of the rotation and has
 * nothing to say while there is none.
 */
export function progress(travelled: number, width: number, lead: number): number {
	if (!(width > 0)) return 0;
	return Math.min(1, turning(travelled, lead) / width);
}

/**
 * The angle a drag has turned the paper to, in degrees.
 *
 * `sign` is which way this side of the paper goes: the sheet turns one way to
 * show the panel, the panel the other to show the sheet back.
 */
export function angleAt(travelled: number, width: number, sign: 1 | -1, lead: number): number {
	return progress(travelled, width, lead) * QUARTER * sign;
}

/** Where the axis has wandered to, as a percentage across the paper. */
export function axisAt(travelled: number, width: number, lead: number): number {
	return 50 + progress(travelled, width, lead) * DRIFT;
}

/**
 * How much of the drag actually went into turning the paper.
 *
 * Everything before this went into sliding it and into the push that follows,
 * neither of which turns anything.
 */
function turning(travelled: number, lead: number): number {
	return Math.max(0, travelled - SLACK - Math.max(0, lead) - OVER);
}

/**
 * Whether letting go here finishes the turn rather than swinging back.
 *
 * A quarter of the paper's width, or a flick. Both are measured on the part of
 * the drag that turned the paper, not on the whole of it — with the slide and
 * the overdrag in front, a flick of forty-one pixels would otherwise commit a
 * turn that had not visibly begun.
 *
 * The flick is counted in pixels and milliseconds rather than as a fraction,
 * because a flick is a movement of the hand and a hand does not know how wide
 * the paper is.
 */
export function commits(travelled: number, elapsed: number, width: number, lead: number): boolean {
	const turned = turning(travelled, lead);
	const flick = turned > 40 && elapsed < 250;
	return flick || turned > width * 0.25;
}
