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

/** `---`, `***`, `___`: a rule, not an item. */
const RULE = /^\s{0,3}([-*_])\s*(\1\s*){2,}$/;
/** A fence, and everything between two of them, is code rather than a list. */
const FENCE = /^\s{0,3}(```|~~~)/;
const TAG = /<\/?[a-zA-Z][^>]*>/g;

/**
 * What this plainly is not.
 *
 * A list is lines of words. Something that opens with a brace or a bracket and
 * parses as JSON is a data file, and something built out of tags is a web page
 * — both would come in as a heap of tasks made of punctuation, and the person
 * pasting would have to undo them one at a time.
 *
 * Named rather than merely refused, so the modal can say which it was.
 */
export function looksStructured(input: string): 'json' | 'html' | null {
	const text = input.trim();
	if (text === '') return null;

	const first = text[0];
	const last = text[text.length - 1];

	if ((first === '{' && last === '}') || (first === '[' && last === ']')) {
		try {
			JSON.parse(text);
			return 'json';
		} catch {
			// A checklist can open with `[ ]`, which is not JSON and not meant to be.
		}
	}

	// Either it opens as markup, or it is riddled with it. One stray `<` in a
	// sentence is neither.
	const tags = text.match(TAG)?.length ?? 0;
	if (first === '<' || tags >= 3) return 'html';

	return null;
}

/** Other apps use [/] and [-] for half done, so both are accepted. */
function stateFor(marker: string): State {
	if (marker === 'x' || marker === 'X') return 'done';
	if (marker === '~' || marker === '/' || marker === '-') return 'half';
	return 'todo';
}

export function fromMarkdown(input: string): Parsed | null {
	if (looksStructured(input)) return null;

	const groups: ParsedGroup[] = [];
	// Items before the first heading go into an untitled group.
	let current: ParsedGroup = { title: '', tasks: [] };
	groups.push(current);

	let tasks = 0;
	let fenced = false;

	for (const raw of input.split(/\r?\n/)) {
		if (FENCE.test(raw)) {
			fenced = !fenced;
			continue;
		}
		if (fenced) continue;

		const heading = raw.match(HEADING);
		if (heading) {
			current = { title: clean(heading[1], LIMITS.groupTitle), tasks: [] };
			groups.push(current);
			continue;
		}

		if (raw.trim() === '' || RULE.test(raw)) continue;

		/*
		 * A line is an item, bullet or no bullet. Most lists people have lying
		 * about are lines of words in a note, and asking them to add a dash to
		 * each one first is asking them to do the import by hand.
		 */
		const bullet = raw.match(BULLET);
		const body = bullet ? bullet[1] : raw.trim();

		const marked = body.match(MARKER);
		const state = marked ? stateFor(marked[1]) : 'todo';
		const text = clean(marked ? marked[2] : body, LIMITS.taskText);

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
