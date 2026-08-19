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
	/**
	 * Where the lifted thing came from, so the places that would put it back
	 * exactly there can offer nothing.
	 *
	 * A landing rule drawn immediately above or immediately below the row being
	 * carried is a landing rule for the place it already occupies: letting go on
	 * either changes nothing, and the sheet spends most of a short drag showing
	 * two of them. Read once at the lift rather than derived, because the list
	 * moves under the finger as groups expand.
	 */
	from = $state<DropTarget | null>(null);

	/** The group currently lifted, if any. Never both at once. */
	groupId = $state<string | null>(null);
	groupTarget = $state<number | null>(null);
	groupFrom = $state<number | null>(null);

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

	/**
	 * The same, for a group being moved among its siblings.
	 *
	 * The index has to be translated on the way in, because the two sides count
	 * in different lists. `groupTargetAt` skips the group being carried — a
	 * group cannot land beside itself, and the order it is asked for is the
	 * order of the ones staying still, which is what `groupOrderAt` wants too.
	 * The markup counts with its own `{#each}`, which has every group in it,
	 * the carried one included.
	 *
	 * The two agree until the finger passes the hole the carried group left,
	 * and from there they are one apart: everything after the hole answers to
	 * an index one lower in the shorter list. So the rule was drawn a group
	 * short of where the group would actually land — the drop was right and
	 * the mark pointing at it was not, which is the worse way round.
	 */
	isGroupLanding(index: number): boolean {
		if (this.groupTarget === null) return false;
		const from = this.groupFrom;
		const shift = from !== null && this.groupTarget >= from ? 1 : 0;
		return this.groupTarget + shift === index;
	}

	reset(): void {
		this.taskId = null;
		this.target = null;
		this.from = null;
		this.groupId = null;
		this.groupTarget = null;
		this.groupFrom = null;
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
	 * landing spot there, and nothing is drawn until the finger reaches a
	 * boundary between two other rows.
	 *
	 * The previous target used to stand instead. That kept a rule on the sheet
	 * through the whole of a short drag, and the rule it kept was almost always
	 * one of the two either side of the row itself — which is to say a rule
	 * offering to put the row back where it already was.
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

/**
 * Where a row sits now, counted among its siblings including itself.
 *
 * That count is exactly the index that would put it back: taking a row out of
 * its own list shifts everything below it up by one, so inserting at the same
 * number in the shortened list lands it between the same two neighbours.
 */
function homeOf(taskId: string): DropTarget | null {
	const row = document.querySelector<HTMLElement>(`[data-task="${taskId}"]`);
	const groupId = row?.closest<HTMLElement>('[data-group]')?.dataset.group;
	if (!row || !groupId) return null;

	const siblings = [
		...document.querySelectorAll<HTMLElement>(`[data-group="${groupId}"] [data-task]`)
	];
	return { groupId, index: siblings.indexOf(row) };
}

/** Whether a target is the place the lifted row is already in. */
function isHome(target: DropTarget | null): boolean {
	return (
		target !== null &&
		drag.from !== null &&
		target.groupId === drag.from.groupId &&
		target.index === drag.from.index
	);
}

export const dragRow: Action<HTMLElement, DragOptions> = (node, initial) => {
	let options = initial;

	/** A target, unless it is the one that would change nothing. */
	function landing(x: number, y: number): DropTarget | null {
		const next = targetAt(x, y, options.taskId);
		return isHome(next) ? null : next;
	}

	const destroy = pressDrag(node, () => ({
		enabled: () => true,
		lift(x, y) {
			drag.taskId = options.taskId;
			drag.from = homeOf(options.taskId);
			drag.target = landing(x, y);
		},
		move(x, y) {
			/*
			 * Cleared rather than held. Over its own row, or at either boundary
			 * beside it, there is nothing to offer — and a rule left standing
			 * from a moment ago is a rule pointing at somewhere the finger has
			 * left.
			 */
			const next = landing(x, y);
			drag.target = next;
			if (!next) return;

			if (next.groupId !== options.groupId) options.onEnterGroup?.(next.groupId);
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

/** Where a group sits now, counted among its siblings including itself. */
function groupHomeOf(groupId: string): number | null {
	const sections = [...document.querySelectorAll<HTMLElement>('[data-group]')];
	const at = sections.findIndex((el) => el.dataset.group === groupId);
	return at === -1 ? null : at;
}

/** The same long press that lifts a row, lifting the whole group instead. */
export const dragGroup: Action<HTMLElement, GroupDragOptions> = (node, initial) => {
	let options = initial;

	/** The same rule the rows follow: no landing where it already is. */
	function landing(y: number): number | null {
		const next = groupTargetAt(y, options.groupId);
		return next !== null && next === drag.groupFrom ? null : next;
	}

	const destroy = pressDrag(node, () => ({
		enabled: () => options.enabled,
		lift(_x, y) {
			drag.groupId = options.groupId;
			drag.groupFrom = groupHomeOf(options.groupId);
			drag.groupTarget = landing(y);
		},
		move(_x, y) {
			drag.groupTarget = landing(y);
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
