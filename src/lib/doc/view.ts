import { byOrder } from './order';
import type { Doc, Task } from './types';

/**
 * The render model. Computed on read and never written back — a task orphaned
 * by a group its owner deleted must not be mutated to fix it, because the
 * other device may still have that group.
 */

export const LOOSE_ENDS_ID = '__loose__';
export const LOOSE_ENDS_TITLE = 'Loose ends';

export type ViewGroup = {
	id: string;
	title: string;
	tasks: Task[];
	/** Loose ends is assembled here, not stored, so it cannot be renamed. */
	synthetic: boolean;
};

export function view(doc: Doc): ViewGroup[] {
	const groups = Object.values(doc.groups)
		.filter((g) => !g.deleted)
		.sort(byOrder);

	const known = new Set(groups.map((g) => g.id));
	const tasks = Object.values(doc.tasks)
		.filter((t) => !t.deleted)
		.sort(byOrder);

	const byGroup = new Map<string, Task[]>();
	const orphans: Task[] = [];

	for (const task of tasks) {
		if (!known.has(task.groupId)) {
			orphans.push(task);
			continue;
		}
		const bucket = byGroup.get(task.groupId);
		if (bucket) bucket.push(task);
		else byGroup.set(task.groupId, [task]);
	}

	const out: ViewGroup[] = groups.map((group) => ({
		id: group.id,
		title: group.title,
		tasks: byGroup.get(group.id) ?? [],
		synthetic: false
	}));

	if (orphans.length > 0) {
		out.push({
			id: LOOSE_ENDS_ID,
			title: LOOSE_ENDS_TITLE,
			tasks: orphans,
			synthetic: true
		});
	}

	return out;
}

/** The one flourish: fires when the last open task on the sheet is ticked. */
export function allDone(doc: Doc): boolean {
	const tasks = Object.values(doc.tasks).filter((t) => !t.deleted);
	return tasks.length > 0 && tasks.every((t) => t.state === 'done');
}

export function openCount(doc: Doc): number {
	return Object.values(doc.tasks).filter((t) => !t.deleted && t.state !== 'done').length;
}
