import type { Action } from 'svelte/action';
import { buzz, LONG_PRESS_MS } from './longpress';

/**
 * Long-press the row text and drag. No handle.
 *
 * The checkbox keeps its own long-press for half-done, so the two gestures are
 * separated by hit area rather than by timing: a press that starts on the
 * checkbox never becomes a drag, and a press that starts on the text never
 * changes state. This action is only ever attached to the text.
 */

export type DropTarget = { groupId: string; index: number };

const EDGE = 60;
const EDGE_SPEED = 12;

export class DragState {
	/** The task currently lifted, if any. */
	taskId = $state<string | null>(null);
	target = $state<DropTarget | null>(null);

	get dragging(): boolean {
		return this.taskId !== null;
	}

	isLifted(taskId: string): boolean {
		return this.taskId === taskId;
	}

	/** True where the dashed landing rule should be drawn. */
	isLanding(groupId: string, index: number): boolean {
		return this.target?.groupId === groupId && this.target.index === index;
	}

	reset(): void {
		this.taskId = null;
		this.target = null;
	}
}

export const drag = new DragState();

export type DragOptions = {
	taskId: string;
	groupId: string;
	onDrop: (target: DropTarget) => void;
	/** Dropping into a collapsed group expands it. */
	onEnterGroup?: (groupId: string) => void;
};

/**
 * Works out where the pointer would drop the row, by hit-testing the rows and
 * groups under it rather than tracking geometry we would have to keep in sync
 * with the DOM.
 */
function targetAt(x: number, y: number, movingId: string): DropTarget | null {
	const elements = document.elementsFromPoint(x, y);

	const row = elements.find((el) => el instanceof HTMLElement && el.dataset.task) as
		HTMLElement | undefined;

	if (row) {
		const groupId = row.closest<HTMLElement>('[data-group]')?.dataset.group;
		if (!groupId) return null;

		const siblings = [
			...document.querySelectorAll<HTMLElement>(`[data-group="${groupId}"] [data-task]`)
		].filter((el) => el.dataset.task !== movingId);

		const index = siblings.indexOf(row);
		if (index === -1) return { groupId, index: siblings.length };

		// Top half means above this row, bottom half means below it.
		const box = row.getBoundingClientRect();
		return { groupId, index: y < box.top + box.height / 2 ? index : index + 1 };
	}

	const group = elements.find((el) => el instanceof HTMLElement && el.dataset.group) as
		HTMLElement | undefined;

	if (group?.dataset.group) {
		const count = group.querySelectorAll('[data-task]').length;
		return { groupId: group.dataset.group, index: count };
	}

	return null;
}

export const dragRow: Action<HTMLElement, DragOptions> = (node, initial) => {
	let options = initial;
	let timer: ReturnType<typeof setTimeout> | null = null;
	let start: { x: number; y: number } | null = null;
	let lifted = false;
	let pointerId: number | null = null;
	let scrolling: number | null = null;
	let edge = 0;

	function autoScroll() {
		if (edge === 0) {
			scrolling = null;
			return;
		}
		window.scrollBy(0, edge);
		scrolling = requestAnimationFrame(autoScroll);
	}

	/*
	 * Non-passive, and attached for the whole lifetime rather than flipped mid
	 * gesture: browsers latch touch-action at gesture start, so switching it
	 * once a drag begins does nothing and the page scrolls under the finger.
	 */
	function ontouchmove(event: TouchEvent) {
		if (lifted) event.preventDefault();
	}

	function stop() {
		if (timer) clearTimeout(timer);
		timer = null;
		start = null;
		edge = 0;

		if (scrolling !== null) cancelAnimationFrame(scrolling);
		scrolling = null;

		if (pointerId !== null && node.hasPointerCapture(pointerId)) {
			node.releasePointerCapture(pointerId);
		}
		pointerId = null;
		lifted = false;
	}

	function onpointerdown(event: PointerEvent) {
		if (event.button !== 0) return;

		start = { x: event.clientX, y: event.clientY };
		pointerId = event.pointerId;

		timer = setTimeout(() => {
			timer = null;
			lifted = true;
			buzz();

			if (pointerId !== null) node.setPointerCapture(pointerId);
			drag.taskId = options.taskId;
			drag.target = targetAt(event.clientX, event.clientY, options.taskId);
		}, LONG_PRESS_MS);
	}

	function onpointermove(event: PointerEvent) {
		if (!lifted) {
			// Movement before the threshold means a scroll, not a drag.
			if (start && Math.hypot(event.clientX - start.x, event.clientY - start.y) > 8) {
				stop();
			}
			return;
		}

		const next = targetAt(event.clientX, event.clientY, options.taskId);
		if (next) {
			if (next.groupId !== options.groupId) options.onEnterGroup?.(next.groupId);
			drag.target = next;
		}

		edge =
			event.clientY < EDGE
				? -EDGE_SPEED
				: event.clientY > window.innerHeight - EDGE
					? EDGE_SPEED
					: 0;

		if (edge !== 0 && scrolling === null) scrolling = requestAnimationFrame(autoScroll);
	}

	function onpointerup() {
		const target = drag.target;
		const dropped = lifted;

		stop();
		drag.reset();

		if (dropped && target) options.onDrop(target);
	}

	/** A scroll won the race, or the gesture was interrupted. Restore the row. */
	function oncancel() {
		stop();
		drag.reset();
	}

	node.addEventListener('pointerdown', onpointerdown);
	node.addEventListener('pointermove', onpointermove);
	node.addEventListener('pointerup', onpointerup);
	node.addEventListener('pointercancel', oncancel);
	node.addEventListener('touchmove', ontouchmove, { passive: false });

	return {
		update(next: DragOptions) {
			options = next;
		},
		destroy() {
			stop();
			node.removeEventListener('pointerdown', onpointerdown);
			node.removeEventListener('pointermove', onpointermove);
			node.removeEventListener('pointerup', onpointerup);
			node.removeEventListener('pointercancel', oncancel);
			node.removeEventListener('touchmove', ontouchmove);
		}
	};
};
