/*
 * Turning the paper by hand.
 *
 * The sheet and the panel are two sides of one receipt, and each is turned out
 * of the way by dragging the other into view. The arithmetic is the same on
 * both sides, so it lives here rather than twice: how far a drag has turned the
 * paper, where the axis has wandered to, and whether letting go finishes the
 * turn or lets it swing back.
 *
 * Which way it turns is decided by the push, and only by the push. A hand
 * moving rightwards sends the paper round one way and a hand moving leftwards
 * sends it round the other, the way a receipt spun between two fingers does —
 * so everything here takes the distance travelled with its sign on and hands
 * back an answer with the same sign on it. Neither face has a direction of its
 * own; both are carried by whichever hand is on them.
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

/**
 * Which way a push is going: 1 rightwards, -1 leftwards.
 *
 * A push of nothing has no direction to report, and rightwards is the answer
 * it gives — which is the way a tap turns the paper, so a gesture that never
 * moved agrees with one that never happened.
 */
export function pushOf(travelled: number): 1 | -1 {
	return travelled < 0 ? -1 : 1;
}

/**
 * How far the paper has slid, in pixels: the lead-in, before any turn.
 *
 * Signed, because the paper slides the way it is pushed. Everything below
 * measures the reach of a push and leaves its direction to `pushOf`.
 */
export function slideAt(travelled: number, lead: number): number {
	const reach = Math.min(Math.max(0, lead), Math.max(0, Math.abs(travelled) - SLACK));
	return reach * pushOf(travelled);
}

/**
 * How far a hand has to travel to turn the paper the whole quarter, as a
 * fraction of the paper's own width.
 *
 * Half, and not all of it, because on a phone the paper *is* the screen. At 390
 * pixels wide on a 390 pixel screen, a quarter turn geared to the full width
 * needed four hundred and sixteen pixels of drag — the dead travel in front of
 * it and then the width itself — which is more room than exists. The paper
 * could not be turned over by hand at all: the furthest a thumb could get it,
 * running the entire screen, was eighty-two degrees, and any ordinary swipe
 * reached ten or twenty before it had to let go.
 *
 * So every drag ended by falling over from an angle the hand had barely moved
 * it to, and the animation covered the rest at a speed the hand had never been
 * going. Geared to half the width, a comfortable swipe turns it most of the way
 * round and the commit threshold below lands exactly on the halfway point.
 */
export const REACH = 0.5;

/**
 * How much of the turn a drag has covered, from 0 to 1.
 *
 * Counted from the end of the lead-in and the overdrag past it, so the paper is
 * flat for as long as it is only sliding and for the push that follows — and so
 * is the weight of its near edge, which is a reading of the rotation and has
 * nothing to say while there is none.
 */
export function progress(travelled: number, width: number, lead: number): number {
	if (!(width > 0)) return 0;
	return Math.min(1, turning(travelled, lead) / (width * REACH));
}

/**
 * The angle a drag has turned the paper to, in degrees.
 *
 * The sign is the push's own. It used to be a parameter, on the reasoning that
 * the sheet turned one way and the panel the other — but both were always
 * given the same one, because the two are halves of a single rotation and a
 * receipt does not know which of its faces is up. What decides the direction
 * is the hand.
 */
export function angleAt(travelled: number, width: number, lead: number): number {
	const turned = progress(travelled, width, lead) * QUARTER;
	// Flat is flat: without this a leftward push that has not begun to turn yet
	// reports -0, which is a different number from 0 to everything that asks.
	return turned === 0 ? 0 : turned * pushOf(travelled);
}

/**
 * Where the axis has wandered to, as a percentage across the paper.
 *
 * It gives the way the push does: a hand shoving the paper leftwards carries
 * the point it turns about leftwards with it.
 */
export function axisAt(travelled: number, width: number, lead: number): number {
	return 50 + progress(travelled, width, lead) * DRIFT * pushOf(travelled);
}

/**
 * How much of the drag actually went into turning the paper.
 *
 * Everything before this went into sliding it and into the push that follows,
 * neither of which turns anything.
 */
function turning(travelled: number, lead: number): number {
	return Math.max(0, Math.abs(travelled) - SLACK - Math.max(0, lead) - OVER);
}

/**
 * Whether letting go here finishes the turn rather than swinging back.
 *
 * Past halfway, or a flick. Halfway is the honest threshold for a thing being
 * turned over: beyond the middle it falls the rest of the way on its own, and
 * short of it it comes back — which is what a receipt held on its edge does.
 * Written as the progress rather than as a distance so it stays the halfway
 * point if `REACH` is ever retuned.
 *
 * The flick is counted in pixels and milliseconds rather than as a fraction,
 * because a flick is a movement of the hand and a hand does not know how wide
 * the paper is. It is measured on the part of the drag that turned the paper,
 * not on the whole of it — with the slide and the overdrag in front, a flick of
 * forty-one pixels would otherwise commit a turn that had not visibly begun.
 */
export function commits(travelled: number, elapsed: number, width: number, lead: number): boolean {
	const flick = turning(travelled, lead) > 40 && elapsed < 250;
	return flick || progress(travelled, width, lead) > 0.5;
}

/**
 * How much of a half-turn is left to play, from 0 to 1.
 *
 * The face on its way out has already been carried part of the way by the hand,
 * and only the rest of it has to be animated. Given to the animation as a
 * fraction of `--flip`, the paper carries on at one rate however far round the
 * finger left it — rather than always taking the full duration, which flung it
 * through eighty degrees after a small push and crawled through the last five
 * after a large one.
 */
export function fallOf(angle: number): number {
	return Math.min(1, Math.max(0, (QUARTER - Math.abs(angle)) / QUARTER));
}
