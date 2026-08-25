import type { Action } from 'svelte/action';
import { buzz, LIFT_MS, LONG_PRESS_MS } from './longpress';

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

/**
 * Not a place among the groups — the switcher, up in the corner.
 *
 * A group carried onto it stops being part of this list and becomes one of its
 * own. The same trick `NEW_GROUP` plays, one level up: a target in the shape of
 * the answer rather than a second kind of drop, because everything between the
 * hit test and the drop already speaks in indices and this is the one thing
 * that is not one.
 */
export const NEW_LIST = '__newlist__';

/** Where a carried group would land: among its siblings, or off the sheet. */
export type GroupTarget = number | typeof NEW_LIST;

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
	groupTarget = $state<GroupTarget | null>(null);
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

	/** Whether a group is in hand at all — the switcher asks, to offer itself. */
	get carryingGroup(): boolean {
		return this.groupId !== null;
	}

	/** Whether the group in hand is over the switcher, which draws its box for it. */
	get overNewList(): boolean {
		return this.groupTarget === NEW_LIST;
	}

	/**
	 * True where the dashed landing rule should be drawn.
	 *
	 * The index has to be translated on the way in, for the same reason
	 * `isGroupLanding` translates its own: the two sides count in different
	 * lists. `targetAt` skips the row being carried, because that is the list
	 * `orderAt` puts it back into; the markup counts with an `{#each}` that has
	 * every row in it, the carried one included.
	 *
	 * The two agree until the boundary passes the hole the carried row left,
	 * and from there they are one apart. So the rule was drawn a row short of
	 * where the row would actually land — and the row it was drawn under was
	 * usually the carried one itself, which is an offer to put it back where it
	 * already is next to a drop that would do something else.
	 */
	isLanding(groupId: string, index: number): boolean {
		if (this.target === null || this.target.groupId !== groupId) return false;

		const from = this.from;
		const shift =
			from !== null && from.groupId === groupId && this.target.index >= from.index ? 1 : 0;

		return this.target.index + shift === index;
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
		// The switcher is not an index and no rule on the sheet answers to it.
		if (this.groupTarget === null || this.groupTarget === NEW_LIST) return false;
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
		/*
		 * Counted without the row being carried, exactly as the branch above
		 * counts. This is the space `orderAt` works in, and it did not use to be
		 * the space this line answered in: a drop below the last task — which
		 * lands here, on the add row rather than on any task — reported one more
		 * than there were siblings, so `orderAt` found no neighbour on either
		 * side and `between(null, null)` handed back the *first* key there is.
		 * The task went to the top of the group, from the bottom of it.
		 *
		 * It was also the one place the no-op guard could not fire: a row already
		 * last in its group asked to be put after itself, and the count being one
		 * too high is what stopped `isHome` recognising it.
		 */
		const count = [...group.querySelectorAll<HTMLElement>('[data-task]')].filter(
			(el) => el.dataset.task !== movingId
		).length;
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
	/**
	 * The shorter of two presses, for a control that has two in it.
	 *
	 * Given, the press becomes two stages: this one at `LONG_PRESS_MS`, and the
	 * lift at `LIFT_MS`. It answers a release between the two rather than firing
	 * at the threshold itself, because nothing at the threshold can know whether
	 * the finger is going to stay down — the buzz there is what says a release
	 * now will do this rather than that.
	 */
	press?: () => void;
	lift: (x: number, y: number) => void;
	move: (x: number, y: number) => void;
	drop: () => void;
};

function pressDrag(node: HTMLElement, hooks: () => Hooks) {
	let timer: ReturnType<typeof setTimeout> | null = null;
	let start: { x: number; y: number } | null = null;
	let lifted = false;
	/** Past the shorter of two presses, and not yet past the longer. */
	let held = false;
	let pointerId: number | null = null;
	let scrolling: number | null = null;
	let edge = 0;
	/*
	 * A release after a press still fires a click on whatever was held, and what
	 * was held is a button — so dropping a task opened its editor, and dropping
	 * a group opened its name, and a press that opens a group's name would fold
	 * the group underneath it. The click after either is swallowed.
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

		/*
		 * Cleared before the release below rather than after it. Letting a
		 * capture go fires `lostpointercapture` there and then, and the handler
		 * for that has to be able to tell our own tidying up — where a drop is
		 * still to be delivered — from the browser taking the pointer away.
		 */
		lifted = false;
		held = false;

		if (pointerId !== null && node.hasPointerCapture(pointerId)) {
			node.releasePointerCapture(pointerId);
		}
		pointerId = null;
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
		held = false;

		start = { x: event.clientX, y: event.clientY };
		pointerId = event.pointerId;

		function lift() {
			timer = null;
			lifted = true;
			buzz();

			if (pointerId !== null) node.setPointerCapture(pointerId);
			hooks().lift(event.clientX, event.clientY);
		}

		/*
		 * One press or two. With a `press` hook the threshold below is only the
		 * first of them: it buzzes to say the gesture has stopped being a tap,
		 * and the lift waits the rest of the way to `LIFT_MS`. Letting go in
		 * between is what the shorter press means, and `onpointerup` answers it.
		 */
		timer = setTimeout(() => {
			if (!hooks().press) {
				lift();
				return;
			}

			held = true;
			buzz();
			timer = setTimeout(lift, LIFT_MS - LONG_PRESS_MS);
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
		// Past the shorter press and let go before the longer one: the release is
		// what the shorter press means.
		const briefly = held && !lifted;

		/*
		 * Armed before the hooks run, not after. The shorter press can take the
		 * node out of the document — a group title swaps itself for its own edit
		 * field — and the listener that swallows the click would go with it.
		 */
		dropped = moved || briefly;
		if (settle) clearTimeout(settle);
		settle = dropped ? setTimeout(() => (dropped = false), 400) : null;

		stop();

		if (moved) hooks().drop();
		else if (briefly) hooks().press?.();

		drag.reset();
	}

	/** A scroll won the race, or the gesture was interrupted. Put it back. */
	function oncancel() {
		stop();
		drag.reset();
	}

	/**
	 * The pointer was taken away rather than let go of.
	 *
	 * A capture can end without a `pointerup` ever arriving here — the browser
	 * hands the gesture to something else, or the OS interrupts it — and then
	 * nothing else would ever put the drag down. Guarded on `lifted`, which
	 * `stop` clears before it releases a capture of its own, so this never
	 * fires in the middle of delivering a drop.
	 */
	function onlost() {
		if (!lifted) return;
		stop();
		drag.reset();
	}

	node.addEventListener('click', onclick, { capture: true });
	node.addEventListener('pointerdown', onpointerdown);
	node.addEventListener('pointermove', onpointermove);
	node.addEventListener('pointerup', onpointerup);
	node.addEventListener('pointercancel', oncancel);
	node.addEventListener('lostpointercapture', onlost);
	node.addEventListener('touchmove', ontouchmove, { passive: false });

	return () => {
		/*
		 * Put the shared drag down if this node was the one holding it.
		 *
		 * The node can leave the document with a finger still on it — a group
		 * title swapped for its own edit field, a row that changes which
		 * element it draws, a list switched out from under the gesture — and
		 * once it has, no pointerup, pointercancel or lostpointercapture will
		 * ever reach these handlers again. The lift is a single shared state, so
		 * what is left behind is not a stalled drag on one row: it is every
		 * group folded shut and a dashed outline round a title, for good, with
		 * nothing on the sheet able to clear it.
		 */
		const held = lifted;
		stop();
		if (held) drag.reset();

		if (settle) clearTimeout(settle);
		node.removeEventListener('click', onclick, { capture: true });
		node.removeEventListener('pointerdown', onpointerdown);
		node.removeEventListener('pointermove', onpointermove);
		node.removeEventListener('pointerup', onpointerup);
		node.removeEventListener('pointercancel', oncancel);
		node.removeEventListener('lostpointercapture', onlost);
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
	/** The shorter press: it opens the name rather than picking the group up. */
	onEdit: () => void;
	onDrop: (target: GroupTarget) => void;
};

/**
 * Where a group would land: its index among the others, by the same top-half /
 * bottom-half rule the rows use, read off the DOM rather than tracked.
 *
 * The switcher is asked first, for the reason `targetAt` asks the new-group row
 * first: it sits above the groups rather than among them, so the sweep below
 * would never find it and the finger would go on reporting whichever group it
 * last passed over. It only offers itself when it is willing to take the drop —
 * see ListSwitcher, which is what puts the attribute there.
 *
 * Null over the dragged group's own section — the same dead zone `targetAt`
 * refuses for a row, and for the same reason: it is still in the DOM, just
 * tilted, and offers no landing spot of its own.
 */
function groupTargetAt(x: number, y: number, movingId: string): GroupTarget | null {
	const over = document.elementsFromPoint(x, y);
	if (over.some((el) => el instanceof HTMLElement && el.dataset.newlist !== undefined)) {
		return NEW_LIST;
	}

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

/**
 * The same press that lifts a row, in two stages on a group's name: the
 * shorter one opens it for changing and the longer one picks the group up.
 *
 * A group title had a press already and wanted a second. Renaming was two taps
 * and nothing else, which is a gesture you have to be told about — where a
 * press is the thing a finger tries on anything it suspects of holding more.
 * So holding briefly opens the name, and holding on carries the group.
 */
export const dragGroup: Action<HTMLElement, GroupDragOptions> = (node, initial) => {
	let options = initial;

	/** The same rule the rows follow: no landing where it already is. */
	function landing(x: number, y: number): GroupTarget | null {
		const next = groupTargetAt(x, y, options.groupId);
		return next !== null && next === drag.groupFrom ? null : next;
	}

	const destroy = pressDrag(node, () => ({
		enabled: () => options.enabled,
		press: () => options.onEdit(),
		lift(x, y) {
			drag.groupId = options.groupId;
			drag.groupFrom = groupHomeOf(options.groupId);
			drag.groupTarget = landing(x, y);
		},
		move(x, y) {
			drag.groupTarget = landing(x, y);
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
