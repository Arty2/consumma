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
/** A list that has just gone from this device, and everything it was. */
export type Gone = {
	/**
	 * The whole index as it stood, or null on a device that never had one.
	 *
	 * The whole of it, and not just the row that went: removing a list also
	 * rewrites what is left, and the rewrite can take the index away
	 * altogether — one list remaining under the bare keys needs no index at
	 * all, so `#persist` drops it. Putting one row back into whatever that
	 * left behind restores the wrong shape, and the other list stops being
	 * reachable. This is the state, not the difference.
	 */
	index: { entries: ListEntry[]; current: string | null } | null;
	/** The gone list's five keys, exactly as they were stored. */
	values: Record<string, string>;
};

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
	createList(): string | null {
		if (sync.busy) return null;

		if (this.entries.length === 0) {
			const now = Date.now();
			this.entries = [{ id: newId(), legacy: true, createdAt: now, lastUsedAt: now }];
			this.current = this.entries[0].id;
		}

		/*
		 * Returned so the caller can put the device back where it found it. JOIN
		 * needs that: it makes a list to arrive into and then may fail to reach
		 * the code, and nobody asked to be left standing on a blank sheet. On a
		 * device that had never had a second list this is the entry minted just
		 * above, which is why it is read here rather than before the call.
		 */
		const left = this.current;

		const now = Date.now();
		const id = newId();
		this.entries = [...this.entries, { id, legacy: false, createdAt: now, lastUsedAt: now }];
		this.switchTo(id);

		return left;
	}

	/**
	 * LEAVE and DELETE, across lists. `sync.forget()` already wipes whatever
	 * key-set is active and reloads it blank — this only decides what happens
	 * next: land on whichever remaining list was used most recently, or, once
	 * none are left, put the device back to a true zero-trace state under the
	 * bare keys, exactly as one that has never remembered more than one list.
	 *
	 * Returns what went, so the toast can offer it back.
	 */
	deleteCurrent(): Gone | null {
		const gone = this.#capture();

		sync.forget();

		if (this.entries.length === 0) return gone;

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
			return gone;
		}

		const survivor = [...remaining].sort((a, b) => b.lastUsedAt - a.lastUsedAt)[0];
		this.switchTo(survivor.id);
		return gone;
	}

	/**
	 * Everything about the list that is about to go, read off the device as the
	 * strings it is stored as.
	 *
	 * Not the parsed document: this is a copy of the five keys the list lives
	 * under, so putting it back is writing them back. The whole of what is lost
	 * is here — leaving touches nothing on the server, and never did — and its
	 * row in the index goes with it, so the switcher gets the list back with the
	 * name and the dates it had rather than as something newly made.
	 */
	#capture(): Gone | null {
		const entry = this.entries.find((candidate) => candidate.id === this.current) ?? null;
		if (this.entries.length > 0 && entry === null) return null;

		const keys = keysFor(entry === null || entry.legacy ? null : entry.id);
		const values: Record<string, string> = {};

		for (const key of [keys.doc, keys.code, keys.version, keys.synced, keys.collapsed]) {
			const value = read(key);
			if (value !== null) values[key] = value;
		}

		const index =
			this.entries.length > 0 ? { entries: [...this.entries], current: this.current } : null;

		return { index, values };
	}

	/**
	 * Undo for the above, and the only undo in the app that is an undelete
	 * rather than a change stamped forward.
	 *
	 * Everywhere else that rule holds because a device that already synced the
	 * deletion would otherwise win the next merge and re-delete everything.
	 * Nothing here ever reached a merge: leaving is local, the server was never
	 * told, and there is no stamp to move. So this is the same bytes going back
	 * under the same keys, which is what makes it exact.
	 */
	restore(gone: Gone): void {
		for (const [key, value] of Object.entries(gone.values)) write(key, value);

		const index = gone.index;
		const open =
			index === null ? null : (index.entries.find((entry) => entry.id === index.current) ?? null);

		// Read before `#persist`, which may take the index away again and empty
		// what it was read from.
		const keys = keysFor(open === null || open.legacy ? null : open.id);

		if (index !== null) {
			this.entries = index.entries;
			this.current = index.current;

			/*
			 * One legacy entry and nothing else is a device that never had an
			 * index, so this takes it away again — which is exactly the shape
			 * this device had a moment ago.
			 */
			this.#persist();
		}

		/*
		 * Pointed at the keys here rather than through `switchTo`, which refuses
		 * to move to the list it is already on — and after a delete that is
		 * precisely where it may be, holding a blank sheet under those very
		 * keys.
		 */
		sheet.switchTo(keys);
		sync.switchTo(keys);
		ui.switchTo(keys);
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
