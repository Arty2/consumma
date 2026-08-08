import { clean } from './clean';
import { isId } from './id';
import { LIMITS } from './limits';
import { byOrder, last } from './order';
import { stamp, type Ctx } from './stamp';
import type { Doc, Group, State, Task } from './types';

/**
 * Every edit to the document goes through one of these. They are pure, they
 * sanitise text at the boundary (§13), and they enforce the count limits from
 * §4 by refusing — never by discarding something that already exists.
 *
 * A count limit is enforced here *and* in the UI, which hides the add row when
 * the list is full. An op that would cross a limit returns the document
 * unchanged rather than throwing: the guards below are the contract, and a
 * silent no-op is the safe failure for something a person is typing into.
 */

export function liveGroups(doc: Doc): Group[] {
	return Object.values(doc.groups)
		.filter((g) => !g.deleted)
		.sort(byOrder);
}

export function liveTasks(doc: Doc, groupId?: string): Task[] {
	return Object.values(doc.tasks)
		.filter((t) => !t.deleted && (groupId === undefined || t.groupId === groupId))
		.sort(byOrder);
}

export function countTasks(doc: Doc): number {
	return Object.values(doc.tasks).filter((t) => !t.deleted).length;
}

export function countGroups(doc: Doc): number {
	return Object.values(doc.groups).filter((g) => !g.deleted).length;
}

export function canAddTask(doc: Doc): boolean {
	return countTasks(doc) < LIMITS.tasks;
}

export function canAddGroup(doc: Doc): boolean {
	return countGroups(doc) < LIMITS.groups;
}

export function doneTasks(doc: Doc): Task[] {
	return liveTasks(doc).filter((t) => t.state === 'done');
}

// ── groups ───────────────────────────────────────────────────────────────────

export function addGroup(doc: Doc, ctx: Ctx, args: { id: string; title: string }): Doc {
	if (!canAddGroup(doc)) return doc;

	const s = stamp(ctx);
	const group: Group = {
		id: args.id,
		title: clean(args.title, LIMITS.groupTitle),
		order: last(liveGroups(doc).map((g) => g.order)),
		deleted: false,
		stamps: { title: s, order: s, deleted: s }
	};

	return { ...doc, groups: { ...doc.groups, [args.id]: group } };
}

export function renameGroup(doc: Doc, ctx: Ctx, id: string, title: string): Doc {
	const group = doc.groups[id];
	if (!group) return doc;

	const next: Group = {
		...group,
		title: clean(title, LIMITS.groupTitle),
		stamps: { ...group.stamps, title: stamp(ctx) }
	};

	return { ...doc, groups: { ...doc.groups, [id]: next } };
}

export function moveGroup(doc: Doc, ctx: Ctx, id: string, order: string): Doc {
	const group = doc.groups[id];
	if (!group) return doc;

	const next: Group = { ...group, order, stamps: { ...group.stamps, order: stamp(ctx) } };
	return { ...doc, groups: { ...doc.groups, [id]: next } };
}

/**
 * Tombstones a group. Its tasks are deliberately left alone — they surface
 * under "Loose ends" on read (view.ts) rather than being destroyed by a
 * deletion the other device may not have intended for them.
 */
/**
 * Removes a group and everything in it.
 *
 * The tasks have to go too. A group is only a name and an order — deleting it
 * alone leaves its tasks with a group id nobody knows, and `view` gathers those
 * into Loose ends. Emptying a finished group would have quietly poured its done
 * tasks back onto the sheet under another heading.
 */
export function deleteGroup(doc: Doc, ctx: Ctx, id: string): Doc {
	const group = doc.groups[id];
	if (!group || group.deleted) return doc;

	let next = doc;
	for (const task of liveTasks(doc, id)) next = deleteTask(next, ctx, task.id);

	const gone: Group = {
		...group,
		deleted: true,
		stamps: { ...group.stamps, deleted: stamp(ctx) }
	};

	return { ...next, groups: { ...next.groups, [id]: gone } };
}

/** Puts a deleted group back, stamping forward the way undo always does. */
export function restoreGroup(doc: Doc, ctx: Ctx, id: string): Doc {
	const group = doc.groups[id];
	if (!group) return doc;

	const back: Group = {
		...group,
		deleted: false,
		stamps: { ...group.stamps, deleted: stamp(ctx) }
	};

	return { ...doc, groups: { ...doc.groups, [id]: back } };
}

// ── tasks ────────────────────────────────────────────────────────────────────

export function addTask(
	doc: Doc,
	ctx: Ctx,
	/** `order` places it; without one it goes on the end. */
	args: { id: string; groupId: string; text: string; order?: string }
): Doc {
	const text = clean(args.text, LIMITS.taskText);
	if (text === '' || !canAddTask(doc)) return doc;

	const s = stamp(ctx);
	const task: Task = {
		id: args.id,
		groupId: args.groupId,
		text,
		state: 'todo',
		order: args.order ?? last(liveTasks(doc, args.groupId).map((t) => t.order)),
		deleted: false,
		stamps: { text: s, state: s, order: s, groupId: s, deleted: s }
	};

	return { ...doc, tasks: { ...doc.tasks, [args.id]: task } };
}

export function editTask(doc: Doc, ctx: Ctx, id: string, text: string): Doc {
	const task = doc.tasks[id];
	if (!task) return doc;

	const next: Task = {
		...task,
		text: clean(text, LIMITS.taskText),
		stamps: { ...task.stamps, text: stamp(ctx) }
	};

	return { ...doc, tasks: { ...doc.tasks, [id]: next } };
}

export function setTaskState(doc: Doc, ctx: Ctx, id: string, state: State): Doc {
	const task = doc.tasks[id];
	if (!task || task.state === state) return doc;

	const next: Task = { ...task, state, stamps: { ...task.stamps, state: stamp(ctx) } };
	return { ...doc, tasks: { ...doc.tasks, [id]: next } };
}

/**
 * Moving across a group boundary sets groupId and order together (§6).
 *
 * The target must be an id a document can actually hold. "Loose ends" is
 * assembled on read and its id is not a real one, but a drag can land on it —
 * and a task pointed at it makes the whole document fail validation, so the
 * next load discards the entire list rather than one task. Refused here rather
 * than only in the UI, because the data layer is what has to hold.
 */
export function moveTask(
	doc: Doc,
	ctx: Ctx,
	id: string,
	args: { groupId: string; order: string }
): Doc {
	const task = doc.tasks[id];
	if (!task || !isId(args.groupId)) return doc;

	const stamps = { ...task.stamps, order: stamp(ctx) };
	if (args.groupId !== task.groupId) stamps.groupId = stamp(ctx);

	const next: Task = { ...task, groupId: args.groupId, order: args.order, stamps };
	return { ...doc, tasks: { ...doc.tasks, [id]: next } };
}

/**
 * A tombstone keeps its id and stamps and nothing else. Dropping the text is
 * what keeps a busy list well inside the blob cap — 100 live tasks with full
 * stamps is roughly 40 KB before compression, so 128 KB leaves ample room for
 * a month of tombstones.
 */
export function deleteTask(doc: Doc, ctx: Ctx, id: string): Doc {
	const task = doc.tasks[id];
	if (!task || task.deleted) return doc;

	const next: Task = {
		...task,
		text: '',
		deleted: true,
		stamps: { ...task.stamps, text: stamp(ctx), deleted: stamp(ctx) }
	};

	return { ...doc, tasks: { ...doc.tasks, [id]: next } };
}

/**
 * Undo. Never rewinds a stamp — it sets `deleted: false` with a new, later one.
 * Rewinding would let a device that already synced the deletion win the next
 * merge and silently re-delete everything.
 */
export function restoreTasks(
	doc: Doc,
	ctx: Ctx,
	entries: readonly { id: string; text: string }[]
): Doc {
	const tasks = { ...doc.tasks };

	for (const entry of entries) {
		const task = tasks[entry.id];
		if (!task) continue;

		tasks[entry.id] = {
			...task,
			text: clean(entry.text, LIMITS.taskText),
			deleted: false,
			stamps: { ...task.stamps, text: stamp(ctx), deleted: stamp(ctx) }
		};
	}

	return { ...doc, tasks };
}

/** CLEAR sweeps `done` tasks and only those. Half-done stays. */
export function clearDone(
	doc: Doc,
	ctx: Ctx
): { doc: Doc; cleared: { id: string; text: string }[] } {
	const cleared = doneTasks(doc).map((t) => ({ id: t.id, text: t.text }));

	let next = doc;
	for (const task of cleared) next = deleteTask(next, ctx, task.id);

	return { doc: next, cleared };
}
