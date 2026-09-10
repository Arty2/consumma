import type { Action } from 'svelte/action';
import { SLACK } from '$lib/turn';
import { drag } from './drag.svelte';

/**
 * Pull a task leftwards and it is ticked off.
 *
 * The words are pushed towards the box at the head of the row, and the box
 * takes the tick — which is the whole of why the pull goes this way and not the
 * other. Rightwards is already the paper turning over, and the two gestures
 * begin in the same place on a row that draws a link, so they are told apart by
 * direction and nothing else has to be arranged between them.
 *
 * It is a fourth gesture on a hit area that already has three — one tap opens
 * the row, two tick it, three set half, and a press picks it up — and it shares
 * with none of them. A press is stillness and this is movement, so the press
 * has already given the gesture up by the time the finger is a few pixels
 * along; the taps are decided on release and this never gets that far, because
 * the click that would follow it is swallowed the way a drop's is.
 *
 * Nothing waits. The tick lands the moment the hand has gone far enough, under
 * the finger, with the buzz that says so — holding it back for the release
 * would put a wait on the one thing the gesture is for, and there is nothing to
 * wait for: past the reach there is no other thing the movement could turn out
 * to have been.
 */

/**
 * How far the hand has to pull, past the slack, before the tick lands.
 *
 * Counted in pixels rather than as a fraction of the row, for the reason the
 * flick that commits a turn is: a pull is a movement of the hand, and a hand
 * does not know how wide the paper is. Short, because it is the common thing a
 * list is for and a gesture that has to be dragged across the screen is one
 * nobody uses twice.
 */
export const REACH = 72;

/**
 * Whether the hand has moved enough to have said what it is doing.
 *
 * A finger on a phone is never perfectly still, and a tap that wobbles by a
 * pixel has not chosen a direction. Nothing is decided until this holds, so the
 * jitter under a tap cannot be read as either a pull or a scroll.
 */
export function moved(dx: number, dy: number): boolean {
	return Math.hypot(dx, dy) > SLACK;
}

/**
 * And whether what it said was a pull rather than a scroll or a turn.
 *
 * Asked once, when the movement is first big enough to mean anything, and never
 * again: the sheet is what scrolls and the paper is what turns, so a gesture
 * that begins as either of those stays that until the finger comes up.
 */
export function leftwards(dx: number, dy: number): boolean {
	return dx < 0 && Math.abs(dx) > Math.abs(dy);
}

/**
 * How far the row has been pulled, in pixels.
 *
 * Uncapped: how far the row may actually go is the room the paper keeps between
 * its writing and its own drawn edge, which is a measurement in the stylesheet
 * and is applied there. This is the hand's travel, and the hand goes on past
 * where the paper stops — which is what the last stretch of the pull is, and
 * what makes the tick land against a row that is already against its margin.
 */
export function pullAt(dx: number): number {
	return Math.max(0, -dx - SLACK);
}

/** Far enough: the tick lands here, under the finger. */
export function lands(dx: number): boolean {
	return pullAt(dx) >= REACH;
}

export type SwipeOptions = {
	/** The row is this far out of place. */
	onpull: (px: number) => void;
	/** The pull reached, and the task is ticked. */
	ontick: () => void;
	/** The hand is done with it: the row goes back where it was. */
	onhome: () => void;
};

export const swipeRow: Action<HTMLElement, SwipeOptions> = (node, initial) => {
	let options = initial;
	let start: { x: number; y: number } | null = null;
	/** Past the slack, and leftwards: this gesture is a pull and nothing else. */
	let pulling = false;
	/** The tick has landed. The rest of the movement has nothing left to do. */
	let spent = false;
	let pointerId: number | null = null;
	let captured = false;
	/*
	 * A pull ends with the finger coming up on the very button the row's taps
	 * are counted on, so the click it fires has to go the way a drop's does —
	 * or every swipe would open the row for editing behind the tick it just
	 * made.
	 */
	let swallow = false;
	let settle: ReturnType<typeof setTimeout> | null = null;

	/** True if this gesture had actually taken hold, so the caller can tidy up. */
	function stop(): boolean {
		const engaged = pulling;

		/*
		 * Cleared before the release below, for the reason `pressDrag` clears
		 * its own first: letting a capture go fires `lostpointercapture` there
		 * and then, and that handler must be able to tell our tidying up from
		 * the browser taking the pointer away.
		 */
		pulling = false;
		start = null;

		if (captured && pointerId !== null && node.hasPointerCapture(pointerId)) {
			node.releasePointerCapture(pointerId);
		}
		captured = false;
		pointerId = null;

		if (engaged) drag.swiping = false;
		return engaged;
	}

	/** Arm the swallow, and disarm it again if no click ever arrives. */
	function arm() {
		swallow = true;
		if (settle) clearTimeout(settle);
		settle = setTimeout(() => (swallow = false), 400);
	}

	function onclick(event: MouseEvent) {
		if (!swallow) return;

		swallow = false;
		event.preventDefault();
		event.stopPropagation();
	}

	function onpointerdown(event: PointerEvent) {
		if (event.button !== 0) return;
		// The paper is turning, or something is already in hand: that gesture
		// has the floor, exactly as it has it over a press.
		if (drag.turning || drag.dragging) return;

		start = { x: event.clientX, y: event.clientY };
		pointerId = event.pointerId;
		spent = false;
	}

	function onpointermove(event: PointerEvent) {
		if (!start) return;

		const dx = event.clientX - start.x;
		const dy = event.clientY - start.y;

		if (!pulling) {
			/*
			 * A press won the race. It takes most of a second to lift something
			 * and the finger can be still for all of it, so a lift is a thing
			 * that can appear after this gesture armed — and once it has, the
			 * row is in hand and being carried, which is not this.
			 */
			if (drag.dragging) {
				start = null;
				return;
			}

			if (!moved(dx, dy)) return;

			/*
			 * The one question, asked once. Anything that is not a pull is the
			 * sheet scrolling or the paper turning, and both of those are given
			 * up to for the rest of the gesture rather than fought over every
			 * time the finger wanders back across the diagonal.
			 */
			if (!leftwards(dx, dy)) {
				start = null;
				return;
			}

			pulling = true;
			drag.swiping = true;

			/*
			 * On the first move rather than on the press, the way both sides of
			 * the paper take theirs: capturing a pointer retargets the click
			 * that follows it, and taking it on `pointerdown` would stop every
			 * button under the finger from working. Taken at all, because the
			 * finger wanders off a row as it goes and without it the release is
			 * never heard — the row would stay standing out of place.
			 */
			node.setPointerCapture(event.pointerId);
			captured = true;
		}

		if (spent) return;

		if (lands(dx)) {
			spent = true;
			options.ontick();
			// The row goes back at once, under a finger that is still moving:
			// what it was asked for has happened, and it has nothing further to
			// say about how much further the hand goes.
			options.onhome();
			return;
		}

		options.onpull(pullAt(dx));
	}

	function onpointerup() {
		if (!stop()) return;

		arm();
		if (!spent) options.onhome();
		spent = false;
	}

	/** A scroll won the race, or the gesture was interrupted. Put it back. */
	function oncancel() {
		if (!stop()) return;

		if (!spent) options.onhome();
		spent = false;
	}

	node.addEventListener('click', onclick, { capture: true });
	node.addEventListener('pointerdown', onpointerdown);
	node.addEventListener('pointermove', onpointermove);
	node.addEventListener('pointerup', onpointerup);
	node.addEventListener('pointercancel', oncancel);
	node.addEventListener('lostpointercapture', oncancel);

	return {
		update(next: SwipeOptions) {
			options = next;
		},
		destroy() {
			/*
			 * The node can go with a finger still on it — a row that opens for
			 * editing swaps this element for a field — and after that no
			 * pointerup ever reaches these handlers again. `drag.swiping` is
			 * shared, so what would be left behind is a paper that will not turn
			 * for as long as the page is open — and a row standing out of place,
			 * since the row itself outlives whichever element drew its words.
			 */
			if (stop() && !spent) options.onhome();
			if (settle) clearTimeout(settle);

			node.removeEventListener('click', onclick, { capture: true });
			node.removeEventListener('pointerdown', onpointerdown);
			node.removeEventListener('pointermove', onpointermove);
			node.removeEventListener('pointerup', onpointerup);
			node.removeEventListener('pointercancel', oncancel);
			node.removeEventListener('lostpointercapture', oncancel);
		}
	};
};
