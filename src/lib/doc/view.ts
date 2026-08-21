import { t } from '$lib/i18n';
import { byOrder } from './order';
import type { Doc, Task } from './types';

/**
 * The render model. Computed on read and never written back — a task orphaned
 * by a group its owner deleted must not be mutated to fix it, because the
 * other device may still have that group.
 */

export const LOOSE_ENDS_ID = '__loose__';
/*
 * Kept as a constant here rather than read from the catalogue at every call
 * site: this is the accessible name of a mark, and everything that reaches for
 * it — the perforation, a keyboard move's announcement, the tests — is asking
 * for the same one thing. The words themselves live with all the other words.
 */
export const LOOSE_ENDS_TITLE: string = t.doc.looseEnds;

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

export function openCount(doc: Doc): number {
	return Object.values(doc.tasks).filter((t) => !t.deleted && t.state !== 'done').length;
}
