/**
 * The addresses inside a task, found on the way to the screen.
 *
 * Nothing here is stored. A task is one string and stays one string — this
 * reads it the way `amountsIn` and `langOf` do, so the markdown export, what
 * merge sees and what a screen reader hears all keep exactly what was typed.
 *
 * Three schemes and no others. `https`, `http` and `mailto` are the ones a
 * shopping list plausibly holds and the ones that do nothing but navigate;
 * anything else a person can type — `javascript:`, `data:`, `blob:` — is a way
 * of running something, and this app hands a string to an href.
 */

/** What a task comes to once its addresses are picked out of it. */
export type Piece = { kind: 'text'; text: string } | { kind: 'link'; href: string; label: string };

/**
 * Runs of non-space opening with a scheme we allow, and only where an address
 * can start: at the beginning, after a space, or just inside a bracket or a
 * quote.
 *
 * The lookbehind is the whole guard rather than a nicety. Without it the
 * pattern finds its scheme anywhere in a word, so `blob:https://heracl.es/x`
 * matches from the `https` and comes back as a link to somewhere the person
 * did not write — the outer scheme, the one that was refused, simply falls off
 * the front. An address begins at a boundary or it is not an address.
 *
 * Deliberately not a URL parser beyond that: the input is a line someone
 * typed, and the end is whitespace. What is caught is handed to `URL`, which
 * is what decides whether it was an address at all.
 */
const CANDIDATE = /(?<![^\s(['"«])(?:https?:\/\/|mailto:)\S+/gi;

/**
 * Punctuation that ends a sentence rather than an address.
 *
 * A closing bracket only counts as trailing when it is unmatched, so
 * `https://en.wikipedia.org/wiki/Ouzo_(drink)` keeps its own brackets while
 * `(see https://heracl.es)` gives its back to the sentence.
 */
const TRAILING = '.,;:!?\'"»)]}';

function trimTrailing(raw: string): string {
	let url = raw;

	while (url.length > 0) {
		const last = url[url.length - 1];
		if (!TRAILING.includes(last)) break;

		// A bracket that closes one opened inside the address belongs to it.
		if (last === ')' && count(url, '(') >= count(url, ')')) break;

		url = url.slice(0, -1);
	}

	return url;
}

function count(text: string, char: string): number {
	let seen = 0;
	for (const c of text) if (c === char) seen++;
	return seen;
}

/** Whether this is one of the three, checked on the parsed address. */
function allowed(url: URL): boolean {
	return url.protocol === 'https:' || url.protocol === 'http:' || url.protocol === 'mailto:';
}

/**
 * What an address is shown as: no protocol, the host, and then the shape of
 * the path rather than the path.
 *
 * A full URL in a list of groceries is a wall of characters that pushes the
 * words off the row, and none of it is read — what is wanted is which site,
 * and which page. So: the host, the first `/`, an ellipsis for the middle, and
 * the last thing the path names.
 *
 *   https://heracl.es/projects/2024/consumma  →  heracl.es/…/consumma
 *   https://heracl.es/consumma                →  heracl.es/consumma
 *   https://heracl.es                         →  heracl.es
 *   mailto:someone@heracl.es                  →  someone@heracl.es
 *
 * The query and the fragment go: they are how a page was reached rather than
 * which page it is, and they are the longest part of a modern link. The href
 * keeps every character — this is a reading, not an edit.
 */
export function abbreviate(url: URL): string {
	if (url.protocol === 'mailto:') return url.pathname;

	const host = url.host;
	const segments = url.pathname.split('/').filter((part) => part !== '');

	if (segments.length === 0) return host;
	if (segments.length === 1) return `${host}/${segments[0]}`;

	return `${host}/…/${segments[segments.length - 1]}`;
}

/**
 * A task split into the words and the addresses, in the order they were
 * written. Text pieces are never empty; a task with no address in it comes
 * back as exactly one text piece, which is the ordinary case.
 */
export function pieces(text: string): Piece[] {
	const out: Piece[] = [];
	let at = 0;

	for (const match of text.matchAll(CANDIDATE)) {
		const raw = trimTrailing(match[0]);

		let url: URL;
		try {
			url = new URL(raw);
		} catch {
			continue;
		}

		if (!allowed(url)) continue;

		// An address that abbreviates to nothing is not one worth linking.
		const label = abbreviate(url);
		if (label === '') continue;

		const start = match.index;
		if (start > at) out.push({ kind: 'text', text: text.slice(at, start) });

		out.push({ kind: 'link', href: url.href, label });
		at = start + raw.length;
	}

	if (at < text.length) out.push({ kind: 'text', text: text.slice(at) });

	return out;
}

/** Whether a task holds anything worth drawing as a link. Cheap, and common. */
export function hasLink(text: string): boolean {
	return pieces(text).some((piece) => piece.kind === 'link');
}
