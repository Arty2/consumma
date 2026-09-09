import { LIMITS } from './limits';
import { countGroups, countTasks, deleteGroup, liveGroups, liveTasks } from './ops';
import { last } from './order';
import { stamp, type Ctx } from './stamp';
import type { Doc, Group, Task } from './types';

/**
 * A whole group, carried from one list to another.
 *
 * The one operation in the app that touches two documents at once, and the
 * reason it is here rather than in ops.ts: every other op takes a document and
 * gives one back, and this takes a pair. It is pure in exactly the same way —
 * no clock of its own, no storage, no knowledge of which list is open — so the
 * state layer is left holding only the question of where the two documents are
 * kept.
 *
 * Nothing is copied and nothing is left behind: the group and its live tasks
 * arrive whole and the group is deleted where it came from, tasks and all,
 * through the ordinary path. What stays behind is tombstones, which is what
 * makes the undo exact — the group can be restored there, with its title, its
 * place and its tasks' states, rather than rebuilt from a copy.
 */
export type Handoff = {
	from: Doc;
	to: Doc;
	/** How many tasks went with it. */
	moved: number;
	/** Which count the destination could not take, or nothing. */
	refused: 'groups' | 'tasks' | null;
};

/**
 * The other half: the group taken back out of the list it was carried to.
 *
 * An ordinary delete, stamped now. Not the bytes that were there before the
 * drop — `lists.restore` may put a whole list back verbatim because leaving
 * never reached a merge, and this is the opposite case: the list it landed on
 * may have a code, may have been synced since, and may have taken other
 * changes in the meantime. Rewinding it would take those with it. So the group
 * arrives, and then the group leaves, and both are things that happened.
 */
export function handBack(to: Doc, ctx: Ctx, groupId: string): Doc {
	return deleteGroup(to, ctx, groupId);
}

/**
 * Every record arrives written fresh rather than moved across.
 *
 * The stamps are the point. A destination that has seen this group before —
 * carried over and brought back, which the undo does — still holds tombstones
 * under these very ids, and a record stamped now beats a tombstone stamped
 * then in any merge. Written with an older stamp it would arrive already
 * deleted, on this device or on the next one to merge it.
 *
 * The task keys travel unchanged. A fractional index is only ever compared
 * against its own siblings, and every one of them is moving too, so the order
 * they were in is the order they arrive in. The group's own key is the one
 * that cannot travel: it is compared against the destination's groups, so it
 * is drawn afresh at the end of them — where a new group always goes.
 */
export function handOff(from: Doc, to: Doc, ctx: Ctx, groupId: string): Handoff | null {
	const group = from.groups[groupId];
	if (!group || group.deleted) return null;

	const carried = liveTasks(from, groupId);

	/*
	 * Refused whole, with both documents handed back untouched. A group is one
	 * thing: landing the group and half its tasks, or the group with nothing in
	 * it, would be the app quietly losing writing to satisfy a counter — which
	 * merge itself is forbidden from doing (see LIMITS).
	 */
	if (countGroups(to) >= LIMITS.groups) return { from, to, moved: 0, refused: 'groups' };
	if (countTasks(to) + carried.length > LIMITS.tasks) {
		return { from, to, moved: 0, refused: 'tasks' };
	}

	const s = stamp(ctx);
	const arrived: Group = {
		...group,
		order: last(liveGroups(to).map((g) => g.order)),
		deleted: false,
		stamps: { title: s, order: s, deleted: s }
	};

	const landed: Record<string, Task> = {};
	for (const task of carried) {
		const ts = stamp(ctx);
		landed[task.id] = {
			...task,
			deleted: false,
			stamps: { text: ts, state: ts, order: ts, groupId: ts, deleted: ts }
		};
	}

	return {
		from: deleteGroup(from, ctx, groupId),
		to: {
			...to,
			groups: { ...to.groups, [groupId]: arrived },
			tasks: { ...to.tasks, ...landed }
		},
		moved: carried.length,
		refused: null
	};
}
