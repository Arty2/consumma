import type { Action } from 'svelte/action';
import { tapped } from '$lib/feel';

export type LongPressOptions = {
	/** Fired the moment the threshold passes, under the finger. */
	onpress: () => void;
	/** Fired on release, only if the press never reached the threshold. */
	ontap?: () => void;
	ms?: number;
	/** Movement past this many pixels means a scroll, not a press. */
	tolerance?: number;
};

export const LONG_PRESS_MS = 450;

/**
 * How long a second tap has to arrive within to be a second tap.
 *
 * Long enough to be one, short enough not to catch two separate decisions. It
 * lives here beside the press because it is the same fact about the same
 * finger, and it was written out three times — on the task row, on the
 * checkbox and on the group title — each with a comment saying it had to agree
 * with the other two. A number that has to agree with itself in three places
 * only agrees until somebody retunes one of them.
 */
export const DOUBLE_TAP_MS = 320;

/** The lift, under the finger. Re-exported so the drag keeps one import. */
export { tapped as buzz };

/**
 * Long-press on the checkbox sets half done; long-press on the row text starts
 * a drag. They share a row, so they must never share a hit area — a press that
 * starts on the checkbox never becomes a drag, and a press that starts on the
 * text never changes state (§6).
 */
export const longPress: Action<HTMLElement, LongPressOptions> = (node, initial) => {
	let options = initial;
	let timer: ReturnType<typeof setTimeout> | null = null;
	let fired = false;
	let start: { x: number; y: number } | null = null;

	function cancel() {
		if (timer) clearTimeout(timer);
		timer = null;
		start = null;
	}

	function onpointerdown(event: PointerEvent) {
		if (event.button !== 0) return;

		fired = false;
		start = { x: event.clientX, y: event.clientY };

		timer = setTimeout(() => {
			fired = true;
			timer = null;
			tapped();
			options.onpress();
		}, options.ms ?? LONG_PRESS_MS);
	}

	function onpointermove(event: PointerEvent) {
		if (!start || fired) return;

		const moved = Math.hypot(event.clientX - start.x, event.clientY - start.y);
		if (moved > (options.tolerance ?? 8)) cancel();
	}

	function onpointerup() {
		const pressed = fired;
		cancel();
		if (!pressed) options.ontap?.();
	}

	function oncontextmenu(event: Event) {
		// Android raises the text-selection menu mid-press without this.
		event.preventDefault();
	}

	node.addEventListener('pointerdown', onpointerdown);
	node.addEventListener('pointermove', onpointermove);
	node.addEventListener('pointerup', onpointerup);
	node.addEventListener('pointercancel', cancel);
	node.addEventListener('pointerleave', cancel);
	node.addEventListener('contextmenu', oncontextmenu);

	return {
		update(next: LongPressOptions) {
			options = next;
		},
		destroy() {
			cancel();
			node.removeEventListener('pointerdown', onpointerdown);
			node.removeEventListener('pointermove', onpointermove);
			node.removeEventListener('pointerup', onpointerup);
			node.removeEventListener('pointercancel', cancel);
			node.removeEventListener('pointerleave', cancel);
			node.removeEventListener('contextmenu', oncontextmenu);
		}
	};
};
