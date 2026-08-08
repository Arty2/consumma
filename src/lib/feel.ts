/**
 * The phone's one way of answering back.
 *
 * Three lengths, and nothing longer: a tap for something done, two for
 * something taken away, and a little run for something finished. A vibration
 * says "heard you" — anything with rhythm enough to be read as a message is a
 * notification, and this app does not send those.
 *
 * `navigator.vibrate` is absent on desktop and refused on iOS Safari, and both
 * are fine. It is the confirmation, never the message.
 */

/** Under the finger rather than on release, so it lands with the change. */
const TAP = 10;
/** Dot dot: something is gone. */
const TAKEN = [TAP, 60, TAP];
/** Dot dot dash: something is finished. */
const FINISHED = [TAP, 50, TAP, 50, 45];

function fire(pattern: number | number[]): void {
	try {
		navigator.vibrate?.(pattern);
	} catch {
		// Not available, or blocked by the browser. Everything still works.
	}
}

/** A thing was done: a task written, a group made, a button pressed. */
export function tapped(): void {
	fire(TAP);
}

/** A thing was removed. */
export function taken(): void {
	fire(TAKEN);
}

/** A task was ticked — the same beat the sparkle is drawn on. */
export function finished(): void {
	fire(FINISHED);
}
