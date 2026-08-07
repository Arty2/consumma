import { clean } from '$lib/doc/clean';
import { LIMITS } from '$lib/doc/limits';
import type { State } from '$lib/doc/types';

/**
 * Reads a markdown checklist.
 *
 * Parsed as *lines*, never rendered as markdown — `**bold**` comes back out as
 * four asterisks and two words, and `<script>` is seven visible characters.
 * Round-tripping is intentionally lossy: markdown carries no ids, stamps or
 * history, so importing an exported list creates new tasks.
 */

export type ParsedTask = { text: string; state: State };
export type ParsedGroup = { title: string; tasks: ParsedTask[] };
export type Parsed = { groups: ParsedGroup[]; tasks: number };

const HEADING = /^\s{0,3}#{1,2}\s+(.*)$/;
const BULLET = /^\s*[-*+]\s+(.*)$/;
const MARKER = /^\[([ xX~/-])\]\s*(.*)$/;

/** Other apps use [/] and [-] for half done, so both are accepted. */
function stateFor(marker: string): State {
	if (marker === 'x' || marker === 'X') return 'done';
	if (marker === '~' || marker === '/' || marker === '-') return 'half';
	return 'todo';
}

export function fromMarkdown(input: string): Parsed | null {
	const groups: ParsedGroup[] = [];
	// Items before the first heading go into an untitled group.
	let current: ParsedGroup = { title: '', tasks: [] };
	groups.push(current);

	let tasks = 0;

	for (const raw of input.split(/\r?\n/)) {
		const heading = raw.match(HEADING);
		if (heading) {
			current = { title: clean(heading[1], LIMITS.groupTitle), tasks: [] };
			groups.push(current);
			continue;
		}

		const bullet = raw.match(BULLET);
		if (!bullet) continue;

		const marked = bullet[1].match(MARKER);
		// A bullet with no marker is a to-do task, so a plain list imports fine.
		const state = marked ? stateFor(marked[1]) : 'todo';
		const text = clean(marked ? marked[2] : bullet[1], LIMITS.taskText);

		if (text === '') continue;

		current.tasks.push({ text, state });
		tasks++;
	}

	if (tasks === 0) return null;

	// A heading with no items still creates the group; the untitled group that
	// every parse starts with is dropped unless something landed in it.
	return {
		groups: groups.filter((group) => group.title !== '' || group.tasks.length > 0),
		tasks
	};
}
