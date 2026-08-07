import { isId } from './id';
import { LIMITS } from './limits';
import { isState, type Doc, type Group, type Stamp, type Task } from './types';

/**
 * Treats a document as untrusted even though only key-holders can write one.
 * A corrupt or hostile document should refuse to load, not crash the app or
 * poison the merge (§13).
 *
 * Hand-written rather than schema-library-shaped: this is the only place it is
 * needed, and every dependency is a script that runs in the build.
 *
 * Unknown fields are dropped rather than rejected, so a document written by a
 * newer version loses what this one does not understand instead of refusing to
 * open. Everything else is rejected outright.
 */

function isRecord(value: unknown): value is Record<string, unknown> {
	return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function stamp(value: unknown): Stamp | null {
	if (!isRecord(value)) return null;
	if (typeof value.t !== 'number' || !Number.isFinite(value.t)) return null;
	if (typeof value.c !== 'string' || !isId(value.c)) return null;
	return { t: value.t, c: value.c };
}

function stamps<K extends string>(value: unknown, keys: readonly K[]) {
	if (!isRecord(value)) return null;

	const out = {} as Record<K, Stamp>;
	for (const key of keys) {
		const parsed = stamp(value[key]);
		if (!parsed) return null;
		out[key] = parsed;
	}
	return out;
}

function text(value: unknown, max: number): string | null {
	if (typeof value !== 'string') return null;
	// Not truncated here — clean() owns that. A document whose text is already
	// past the limit is damaged, not merely long.
	return [...value].length <= max ? value : null;
}

function group(id: string, value: unknown): Group | null {
	if (!isRecord(value) || !isId(id)) return null;

	const title = text(value.title, LIMITS.groupTitle);
	const parsed = stamps(value.stamps, ['title', 'order', 'deleted'] as const);

	if (title === null) return null;
	if (typeof value.order !== 'string' || value.order === '') return null;
	if (typeof value.deleted !== 'boolean') return null;
	if (!parsed) return null;

	return { id, title, order: value.order, deleted: value.deleted, stamps: parsed };
}

function task(id: string, value: unknown): Task | null {
	if (!isRecord(value) || !isId(id)) return null;

	const body = text(value.text, LIMITS.taskText);
	const parsed = stamps(value.stamps, ['text', 'state', 'order', 'groupId', 'deleted'] as const);

	if (body === null) return null;
	if (typeof value.groupId !== 'string' || !isId(value.groupId)) return null;
	if (!isState(value.state)) return null;
	if (typeof value.order !== 'string' || value.order === '') return null;
	if (typeof value.deleted !== 'boolean') return null;
	if (!parsed) return null;

	return {
		id,
		groupId: value.groupId,
		text: body,
		state: value.state,
		order: value.order,
		deleted: value.deleted,
		stamps: parsed
	};
}

/** Returns the document, or null if it is damaged in any way. */
export function validateDoc(value: unknown): Doc | null {
	if (!isRecord(value) || value.v !== 1) return null;
	if (!isRecord(value.groups) || !isRecord(value.tasks)) return null;

	const groups: Doc['groups'] = {};
	for (const [id, raw] of Object.entries(value.groups)) {
		const parsed = group(id, raw);
		if (!parsed) return null;
		groups[id] = parsed;
	}

	const tasks: Doc['tasks'] = {};
	for (const [id, raw] of Object.entries(value.tasks)) {
		const parsed = task(id, raw);
		if (!parsed) return null;
		tasks[id] = parsed;
	}

	return { v: 1, groups, tasks };
}

/** Parses and validates, refusing anything implausibly large before parsing. */
export function parseDoc(json: string): Doc | null {
	if (json.length > LIMITS.plaintextBytes) return null;

	try {
		return validateDoc(JSON.parse(json));
	} catch {
		return null;
	}
}
