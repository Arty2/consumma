/**
 * A bounded trail of what the last few sync attempts actually did, kept only
 * once someone has turned it on.
 *
 * Nothing here is secret — never a code, never plaintext, never a key — but
 * the shape of a real attempt is: which request, what came back, and why a
 * merge or a push did what it did. That is exactly what a console cannot
 * show on a phone, which is the one place this app has to work. Framework-
 * free like the rest of src/lib/sync, so tests exercise the real network
 * layer without pulling Svelte into it — src/lib/state/diagnostics.svelte.ts
 * is the reactive view over this.
 *
 * No timestamp on an entry: the order of the messages already tells the
 * story — a GET, then what it answered, then a merge, then a PUT — and this
 * is read by copying it out and pasting it somewhere, not by timing it.
 */

const MAX_ENTRIES = 80;

let enabled = false;
let entries: string[] = [];
const listeners = new Set<() => void>();

function notify(): void {
	for (const listener of listeners) listener();
}

/** Turning it off also clears what was kept, same as DELETE clears a list. */
export function setTracing(value: boolean): void {
	if (enabled === value) return;
	enabled = value;
	entries = [];
	notify();
}

/** A no-op while off, so nothing here costs anything for anyone who never asked. */
export function trace(text: string): void {
	if (!enabled) return;

	entries = entries.length >= MAX_ENTRIES ? entries.slice(1) : entries.slice();
	entries.push(text);
	notify();
}

export function traceEntries(): readonly string[] {
	return entries;
}

export function clearTrace(): void {
	entries = [];
	notify();
}

export function onTrace(listener: () => void): () => void {
	listeners.add(listener);
	return () => listeners.delete(listener);
}

/** A message worth showing for something caught rather than expected. */
export function errorText(error: unknown): string {
	return error instanceof Error ? error.message : 'unknown error';
}
