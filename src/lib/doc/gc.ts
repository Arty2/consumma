import type { Doc, GroupStamps, TaskStamps } from './types';

export const TOMBSTONE_MS = 30 * 24 * 60 * 60 * 1000;

function newest(stamps: TaskStamps | GroupStamps): number {
	return Math.max(...Object.values(stamps).map((s) => s.t));
}

/**
 * Drops tombstones that have been dead for long enough that no device can
 * still be carrying an older edit for them.
 *
 * Run on the write path only, and never inside merge — like clamp.ts this
 * depends on `now`, and merge has to stay pure. Dropping a tombstone too early
 * would let a device that never saw the deletion resurrect the task.
 */
export function gc(doc: Doc, now: number, maxAge = TOMBSTONE_MS): Doc {
	const cutoff = now - maxAge;
	const groups: Doc['groups'] = {};
	const tasks: Doc['tasks'] = {};

	for (const [id, group] of Object.entries(doc.groups)) {
		if (group.deleted && newest(group.stamps) < cutoff) continue;
		groups[id] = group;
	}

	for (const [id, task] of Object.entries(doc.tasks)) {
		if (task.deleted && newest(task.stamps) < cutoff) continue;
		tasks[id] = task;
	}

	return { v: 1, groups, tasks };
}
