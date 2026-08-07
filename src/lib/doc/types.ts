/**
 * The shared document. Both people can edit offline, so the client merges and
 * the server never sees any of this — see src/lib/doc/merge.ts.
 */

export type State = 'todo' | 'half' | 'done';

/** ms epoch from a per-device monotonic clock, plus the device that set it. */
export type Stamp = { t: number; c: string };

export type TaskStamps = {
	text: Stamp;
	state: Stamp;
	order: Stamp;
	groupId: Stamp;
	deleted: Stamp;
};

export type Task = {
	id: string;
	groupId: string;
	text: string;
	state: State;
	/** Fractional index. Reordering one task must not restamp its neighbours. */
	order: string;
	deleted: boolean;
	stamps: TaskStamps;
};

export type GroupStamps = {
	title: Stamp;
	order: Stamp;
	deleted: Stamp;
};

export type Group = {
	id: string;
	title: string;
	order: string;
	deleted: boolean;
	stamps: GroupStamps;
};

export type Doc = {
	v: 1;
	groups: Record<string, Group>;
	tasks: Record<string, Task>;
};

export const STATES: readonly State[] = ['todo', 'half', 'done'];

export function isState(value: unknown): value is State {
	return value === 'todo' || value === 'half' || value === 'done';
}

export function emptyDoc(): Doc {
	return { v: 1, groups: {}, tasks: {} };
}
