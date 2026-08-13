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

/**
 * Not a group — the row that offers to make one.
 *
 * A task carried onto it lands in a group that does not exist yet, so the drop
 * makes one and puts it there. It is a group id in the shape of the answer
 * rather than a second kind of target, because everything between here and the
 * drop already speaks in group ids.
 */
export const NEW_GROUP = '__newgroup__';

const EDGE = 60;
const EDGE_SPEED = 12;

export class DragState {
	/** The task currently lifted, if any. */
	taskId = $state<string | null>(null);
	target = $state<DropTarget | null>(null);

	/** The group currently lifted, if any. Never both at once. */
	groupId = $state<string | null>(null);
	groupTarget = $state<number | null>(null);

	get dragging(): boolean {
		return this.taskId !== null || this.groupId !== null;
	}

	isLifted(taskId: string): boolean {
		return this.taskId === taskId;
	}

	isLiftedGroup(groupId: string): boolean {
		return this.groupId === groupId;
	}

	/** True where the dashed landing rule should be drawn. */
	isLanding(groupId: string, index: number): boolean {
		return this.target?.groupId === groupId && this.target.index === index;
	}

	/** The same, for a group being moved among its siblings. */
	isGroupLanding(index: number): boolean {
		return this.groupTarget === index;
	}

	reset(): void {
		this.taskId = null;
		this.target = null;
		this.groupId = null;
		this.groupTarget = null;
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

	/*
	 * Asked first, because the row that offers a new group sits between the
	 * groups rather than inside one — neither branch below would find it, and
	 * the pointer would go on reporting the last group it was over.
	 */
	if (elements.some((el) => el instanceof HTMLElement && el.dataset.newgroup !== undefined)) {
		return { groupId: NEW_GROUP, index: 0 };
	}

	/*
	 * The dragged row is still in the DOM, just tilted, so hovering over its
	 * own former place would otherwise hit-test as itself — and, filtered out
	 * of its own siblings list, report the end of the group. There is no
	 * landing spot there: only the boundaries between other rows offer one, so
	 * the previous target stands until the finger reaches one of those.
	 */
	if (elements.some((el) => el instanceof HTMLElement && el.dataset.task === movingId)) {
		return null;
	}

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

/**
 * The long press, the lift, the edge scroll and the tidying up — everything a
 * drag does that is not about what is being dragged.
 *
 * A task and a group are picked up the same way and differ only in where they
 * can land, so the gesture is written once and told what to do at each step.
 */
type Hooks = {
	/** False refuses the gesture outright: Loose ends cannot be moved. */
	enabled: () => boolean;
	lift: (x: number, y: number) => void;
	move: (x: number, y: number) => void;
	drop: () => void;
};

function pressDrag(node: HTMLElement, hooks: () => Hooks) {
	let timer: ReturnType<typeof setTimeout> | null = null;
	let start: { x: number; y: number } | null = null;
	let lifted = false;
	let pointerId: number | null = null;
	let scrolling: number | null = null;
	let edge = 0;
	/*
	 * A release after a drag still fires a click on whatever was held, and what
	 * was held is a button — so dropping a task opened its editor, and dropping
	 * a group opened its name. The click after a drop is swallowed.
	 */
	let dropped = false;
	let settle: ReturnType<typeof setTimeout> | null = null;

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

	function onclick(event: MouseEvent) {
		if (!dropped) return;

		dropped = false;
		event.preventDefault();
		event.stopPropagation();
	}

	function onpointerdown(event: PointerEvent) {
		if (event.button !== 0) return;
		if (!hooks().enabled()) return;

		dropped = false;

		start = { x: event.clientX, y: event.clientY };
		pointerId = event.pointerId;

		timer = setTimeout(() => {
			timer = null;
			lifted = true;
			buzz();

			if (pointerId !== null) node.setPointerCapture(pointerId);
			hooks().lift(event.clientX, event.clientY);
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

		hooks().move(event.clientX, event.clientY);

		edge =
			event.clientY < EDGE
				? -EDGE_SPEED
				: event.clientY > window.innerHeight - EDGE
					? EDGE_SPEED
					: 0;

		if (edge !== 0 && scrolling === null) scrolling = requestAnimationFrame(autoScroll);
	}

	function onpointerup() {
		const moved = lifted;
		stop();

		if (moved) hooks().drop();
		drag.reset();

		/*
		 * Armed for the click that is about to arrive, and disarmed shortly after
		 * in case none does — a touch that produces no click must not leave the
		 * next real tap to be swallowed.
		 */
		dropped = moved;
		if (settle) clearTimeout(settle);
		settle = moved ? setTimeout(() => (dropped = false), 400) : null;
	}

	/** A scroll won the race, or the gesture was interrupted. Put it back. */
	function oncancel() {
		stop();
		drag.reset();
	}

	node.addEventListener('click', onclick, { capture: true });
	node.addEventListener('pointerdown', onpointerdown);
	node.addEventListener('pointermove', onpointermove);
	node.addEventListener('pointerup', onpointerup);
	node.addEventListener('pointercancel', oncancel);
	node.addEventListener('touchmove', ontouchmove, { passive: false });

	return () => {
		stop();
		if (settle) clearTimeout(settle);
		node.removeEventListener('click', onclick, { capture: true });
		node.removeEventListener('pointerdown', onpointerdown);
		node.removeEventListener('pointermove', onpointermove);
		node.removeEventListener('pointerup', onpointerup);
		node.removeEventListener('pointercancel', oncancel);
		node.removeEventListener('touchmove', ontouchmove);
	};
}

export const dragRow: Action<HTMLElement, DragOptions> = (node, initial) => {
	let options = initial;

	const destroy = pressDrag(node, () => ({
		enabled: () => true,
		lift(x, y) {
			drag.taskId = options.taskId;
			drag.target = targetAt(x, y, options.taskId);
		},
		move(x, y) {
			const next = targetAt(x, y, options.taskId);
			if (!next) return;

			if (next.groupId !== options.groupId) options.onEnterGroup?.(next.groupId);
			drag.target = next;
		},
		drop() {
			if (drag.target) options.onDrop(drag.target);
		}
	}));

	return {
		update(next: DragOptions) {
			options = next;
		},
		destroy
	};
};

export type GroupDragOptions = {
	groupId: string;
	/** Loose ends is assembled on read and cannot be moved. */
	enabled: boolean;
	onDrop: (index: number) => void;
};

/**
 * Where a group would land: its index among the others, by the same top-half /
 * bottom-half rule the rows use, read off the DOM rather than tracked.
 *
 * Null over the dragged group's own section — the same dead zone `targetAt`
 * refuses for a row, and for the same reason: it is still in the DOM, just
 * tilted, and offers no landing spot of its own.
 */
function groupTargetAt(y: number, movingId: string): number | null {
	const own = document.querySelector<HTMLElement>(`[data-group="${movingId}"]`);
	if (own) {
		const box = own.getBoundingClientRect();
		if (y >= box.top && y <= box.bottom) return null;
	}

	const sections = [...document.querySelectorAll<HTMLElement>('[data-group]')].filter(
		(el) => el.dataset.group !== movingId
	);

	for (let i = 0; i < sections.length; i++) {
		const box = sections[i].getBoundingClientRect();
		if (y < box.top + box.height / 2) return i;
	}

	return sections.length;
}

/** The same long press that lifts a row, lifting the whole group instead. */
export const dragGroup: Action<HTMLElement, GroupDragOptions> = (node, initial) => {
	let options = initial;

	const destroy = pressDrag(node, () => ({
		enabled: () => options.enabled,
		lift(_x, y) {
			drag.groupId = options.groupId;
			drag.groupTarget = groupTargetAt(y, options.groupId);
		},
		move(_x, y) {
			const next = groupTargetAt(y, options.groupId);
			if (next !== null) drag.groupTarget = next;
		},
		drop() {
			if (drag.groupTarget !== null) options.onDrop(drag.groupTarget);
		}
	}));

	return {
		update(next: GroupDragOptions) {
			options = next;
		},
		destroy
	};
};
