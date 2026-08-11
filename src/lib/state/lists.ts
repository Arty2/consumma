import { isId } from '../doc/id';
import { liveGroups } from '../doc/ops';
import type { Doc } from '../doc/types';
import { FIRST_GROUP } from './doc.svelte';

/**
 * One remembered list. Never carries a name or a code of its own — both are
 * read live off the list's own document (`nameFor`) and its own stored code,
 * so this index cannot drift out of step with what it points at.
 */
export type ListEntry = {
	id: string;
	/**
	 * True for at most one entry: the first list anyone ever has, which keeps
	 * living under today's bare keys forever rather than gaining a suffix it
	 * did not have yesterday. See `keysFor` in ./storage.
	 */
	legacy: boolean;
	createdAt: number;
	lastUsedAt: number;
};

export type ListIndex = {
	v: 1;
	current: string;
	lists: ListEntry[];
};

function isRecord(value: unknown): value is Record<string, unknown> {
	return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function parseEntry(value: unknown): ListEntry | null {
	if (!isRecord(value)) return null;
	if (!isId(value.id)) return null;
	if (typeof value.legacy !== 'boolean') return null;
	if (typeof value.createdAt !== 'number' || !Number.isFinite(value.createdAt)) return null;
	if (typeof value.lastUsedAt !== 'number' || !Number.isFinite(value.lastUsedAt)) return null;

	return {
		id: value.id,
		legacy: value.legacy,
		createdAt: value.createdAt,
		lastUsedAt: value.lastUsedAt
	};
}

/**
 * Parses and validates a stored index, or null if it is absent or damaged.
 * Treated as untrusted the same way a document is (§13) — it lives in
 * localStorage, which is not a place to trust blindly either.
 */
export function parseIndex(json: string | null): ListIndex | null {
	if (json === null) return null;

	try {
		const value: unknown = JSON.parse(json);
		if (!isRecord(value) || value.v !== 1) return null;
		if (typeof value.current !== 'string') return null;
		if (!Array.isArray(value.lists)) return null;

		const lists: ListEntry[] = [];
		for (const raw of value.lists) {
			const parsed = parseEntry(raw);
			if (!parsed) return null;
			lists.push(parsed);
		}

		return { v: 1, current: value.current, lists };
	} catch {
		return null;
	}
}

/**
 * The name a list is known by: its first live group's title, read fresh
 * every time rather than captured anywhere. An untitled first group and a
 * list with no groups at all both read the same as a list nobody has
 * touched yet — there is nothing here worth telling apart.
 */
export function nameFor(doc: Doc): string {
	const title = liveGroups(doc)[0]?.title;
	return title ? title : FIRST_GROUP;
}
