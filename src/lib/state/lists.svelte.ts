import { newId } from '../doc/id';
import { parseDoc } from '../doc/validate';
import { sheet } from './doc.svelte';
import { nameFor, parseIndex, type ListEntry } from './lists';
import { KEYS, keysFor, read, remove, write } from './storage';
import { sync } from './sync.svelte';
import { ui } from './ui.svelte';

/**
 * Every list this device remembers, and which one is open.
 *
 * The index itself is never written just because a single list exists — see
 * `keysFor(null)` in ./storage — so a device with one list looks exactly as
 * it always has: no `consumma:lists` key, and this class reports a count of
 * 0 or 1 purely by reading. It is only materialized the moment a second list
 * actually comes into being, in `createList()`.
 */
export class Lists {
	entries: ListEntry[] = $state([]);
	current: string | null = $state(null);
	loaded = $state(false);

	/** 0, 1, or however many lists are remembered — without ever writing. */
	count: number = $derived(
		this.entries.length > 0 ? this.entries.length : read(KEYS.doc) !== null ? 1 : 0
	);

	/** The switcher earns its place on the page only once there is a choice. */
	visible: boolean = $derived(this.count >= 2);

	/**
	 * Restores which list was open last, and points the sheet, sync and
	 * collapsed state at it. Read-only when there is no index yet — a
	 * single-remembered-list device loads exactly as it always has, through
	 * `sheet.load()`/`sync.load()`/`ui.load()` at the call site.
	 */
	load(): void {
		if (this.loaded) return;
		this.loaded = true;

		const index = parseIndex(read(KEYS.lists));
		if (!index || index.lists.length === 0) return;

		const active = index.lists.find((entry) => entry.id === index.current) ?? index.lists[0];

		this.entries = index.lists;
		this.current = active.id;

		const keys = keysFor(active.legacy ? null : active.id);
		sheet.switchTo(keys);
		sync.switchTo(keys);
		ui.switchTo(keys);
	}

	/** The active list's own name, read live off the document already loaded. */
	activeName(): string {
		return nameFor(sheet.doc);
	}

	/** Another list's name, read straight off its own stored document. */
	nameOf(entry: ListEntry): string {
		if (entry.id === this.current) return this.activeName();

		const keys = keysFor(entry.legacy ? null : entry.id);
		const doc = parseDoc(read(keys.doc) ?? '');
		return doc ? nameFor(doc) : nameFor({ v: 1, groups: {}, tasks: {} });
	}

	/** Another list's code, or null if it has never been synced. */
	codeOf(entry: ListEntry): string | null {
		if (entry.id === this.current) return sync.code;

		const keys = keysFor(entry.legacy ? null : entry.id);
		return read(keys.code);
	}

	/**
	 * Save-and-swap, never a sync — switching lists must never reach the
	 * network on its own (§ sync is entirely manual). Refused while a sync for
	 * the outgoing list is still in flight: `SyncState.sync()` mutates private
	 * fields after an `await`, with no notion of which list it was for, so a
	 * late completion landing on the newly active list would corrupt it.
	 */
	switchTo(id: string): void {
		if (id === this.current || sync.busy) return;

		const target = this.entries.find((entry) => entry.id === id);
		if (!target) return;

		/*
		 * Read before anything is re-pointed: `sheet.written` is about the list
		 * being left, and `sheet.switchTo` below replaces it with the one being
		 * opened.
		 */
		const leaving = this.current;
		const leavingWritten = sheet.written;

		this.entries = this.entries.map((entry) =>
			entry.id === id ? { ...entry, lastUsedAt: Date.now() } : entry
		);
		this.current = id;
		this.#dropIfBlank(leaving, leavingWritten);
		this.#persist();

		const keys = keysFor(target.legacy ? null : target.id);
		sheet.switchTo(keys);
		sync.switchTo(keys);
		ui.switchTo(keys);
	}

	/**
	 * Forgets a list nobody ever wrote on, as it is left.
	 *
	 * A new list is scaffolding until something is put on it — the same
	 * opening group a first-ever visit draws, which `Sheet` deliberately does
	 * not save. Remembering it anyway meant tapping "New list", looking at it
	 * and going back left an untitled empty list in the switcher for good, and
	 * a `consumma:lists` key recording it. It writes nothing, so there is
	 * nothing of it to keep.
	 *
	 * The legacy entry is never dropped: it holds the bare keys a
	 * single-list device has always used, and it is the one entry whose
	 * absence would change where an unrelated list is stored. It does not need
	 * dropping either — once every namespaced list beside it is gone, the
	 * index itself goes and the device is back to exactly the shape it had
	 * before it ever had two.
	 */
	#dropIfBlank(id: string | null, written: boolean): void {
		if (id === null || written) return;

		const entry = this.entries.find((candidate) => candidate.id === id);
		if (!entry || entry.legacy) return;

		this.entries = this.entries.filter((candidate) => candidate.id !== id);

		// Nothing wrote a doc, but a group folded on the way past would have
		// left one key behind of its own.
		const keys = keysFor(entry.id);
		for (const key of [keys.doc, keys.code, keys.version, keys.synced, keys.collapsed]) {
			remove(key);
		}
	}

	/**
	 * Lands on a blank, unnamed slot — the same shape a first-ever visit
	 * seeds and just as quiet, writing nothing until a real edit happens. The
	 * first time this runs there is no index yet: the list already open
	 * becomes the legacy entry, keeping its bare keys, before the new one is
	 * added beside it.
	 */
	createList(): void {
		if (sync.busy) return;

		if (this.entries.length === 0) {
			const now = Date.now();
			this.entries = [{ id: newId(), legacy: true, createdAt: now, lastUsedAt: now }];
			this.current = this.entries[0].id;
		}

		const now = Date.now();
		const id = newId();
		this.entries = [...this.entries, { id, legacy: false, createdAt: now, lastUsedAt: now }];
		this.switchTo(id);
	}

	/**
	 * DELETE, across lists. `sync.forget()` already wipes whatever key-set is
	 * active and reloads it blank — this only decides what happens next: land
	 * on whichever remaining list was used most recently, or, once none are
	 * left, put the device back to a true zero-trace state under the bare
	 * keys, exactly as one that has never remembered more than one list.
	 */
	deleteCurrent(): void {
		sync.forget();

		if (this.entries.length === 0) return;

		const deletedId = this.current;
		const remaining = this.entries.filter((entry) => entry.id !== deletedId);
		this.entries = remaining;

		if (remaining.length === 0) {
			remove(KEYS.lists);
			this.current = null;

			const keys = keysFor(null);
			sheet.switchTo(keys);
			sync.switchTo(keys);
			ui.switchTo(keys);
			return;
		}

		const survivor = [...remaining].sort((a, b) => b.lastUsedAt - a.lastUsedAt)[0];
		this.switchTo(survivor.id);
	}

	/**
	 * Writes the index — or takes it away again.
	 *
	 * One entry left and it is the legacy one means every list this device
	 * made beside the original has been dropped, and the original is already
	 * living under the bare keys a device with a single list has always used.
	 * There is nothing left for an index to say, so it goes rather than
	 * lingering as the one record that this device once had two. That leaves
	 * exactly the state a device that never had a second list is in — which is
	 * what `deleteCurrent` reaches for too, and what makes it reachable at all
	 * without ever moving a list between key-sets.
	 */
	#persist(): void {
		if (this.current === null) return;

		if (this.entries.length === 1 && this.entries[0].legacy) {
			remove(KEYS.lists);
			this.entries = [];
			this.current = null;
			return;
		}

		write(KEYS.lists, JSON.stringify({ v: 1, current: this.current, lists: this.entries }));
	}
}

export const lists = new Lists();
