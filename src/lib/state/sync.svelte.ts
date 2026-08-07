import { derive, newCode, normaliseCode, type Room } from '$lib/crypto/derive';
import { canonical } from '$lib/doc/canonical';
import type { Doc } from '$lib/doc/types';
import { parseDoc } from '$lib/doc/validate';
import { syncNow, type SyncOutcome } from '$lib/sync/client';
import { sheet } from './doc.svelte';
import { KEYS, persist, read, remove, write } from './storage';

/**
 * What the corner button draws: nothing when synced, an outbox arrow when
 * edits are waiting, a crossed circle when the list could not be reached.
 *
 * `offline` outranks the other two — there is no point offering to send when
 * nothing can leave.
 */
export type SyncStatus = 'synced' | 'pending' | 'offline';

/** Long enough that a double tap costs one request, not two. */
export const COOLDOWN_MS = 10_000;

/**
 * Long enough since the last sync that offering one is worth the space.
 *
 * Nothing syncs on its own, so a list left open all morning is exactly as old
 * as when it was opened. This is the one nudge, and it is a button appearing —
 * not a banner, and not a sync happening.
 */
export const STALE_MS = 600_000;

export class SyncState {
	code = $state<string | null>(null);
	status = $state<SyncStatus>('pending');
	busy = $state(false);
	message = $state<string | null>(null);

	/** Set when a sync last completed, so the cooldown can be shown ticking down. */
	lastSyncAt = $state(0);
	now = $state(0);

	#room: Room | null = null;
	#etag: string | null = null;
	/*
	 * Set when an attempt actually failed to reach the list, and cleared only by
	 * one that succeeded.
	 *
	 * `navigator.onLine` is not enough on its own: it says the device has a
	 * network, not that the list is at the end of it. A dead deployment on good
	 * wifi is online by that measure, so without this the mark would flip back
	 * to an outbox on the next edit — or on the next tick of the clock — and
	 * quietly unsay what the last attempt found out.
	 */
	#unreachable = $state(false);
	/*
	 * Reactive: `unsent` compares against this, so a sync that changes only the
	 * snapshot — and not the document — still has to update the mark.
	 */
	#lastSynced = $state<Doc | null>(null);

	/**
	 * The count the SYNC panel shows. It is the honest version of the status
	 * mark: not "something changed" but "this many things have not left this
	 * device".
	 *
	 * A sheet nobody has written on has nothing waiting, whatever is drawn on
	 * it. The opening group is the shape of an empty sheet, and counting it told
	 * someone who had just arrived that a change of theirs was waiting to go.
	 */
	unsent: number = $derived(sheet.written ? countUnsent(sheet.doc, this.#lastSynced) : 0);

	/**
	 * Long enough that a double tap costs one request rather than two. `now` is
	 * ticked by whatever is showing the cooldown, so it clears on its own.
	 */
	cooling: boolean = $derived(this.now - this.lastSyncAt < COOLDOWN_MS);

	/** Whether it has been long enough to be worth offering a sync. */
	stale: boolean = $derived(this.now - this.lastSyncAt > STALE_MS);

	/** Seconds left, for the panel to show rather than leaving a dead button. */
	coolingFor: number = $derived(
		Math.max(0, Math.ceil((COOLDOWN_MS - (this.now - this.lastSyncAt)) / 1000))
	);

	/**
	 * Reads what is already here. It does not make a code.
	 *
	 * A list that has never been synced has no code, because a code is the
	 * address of something on the server and there is nothing there. Making one
	 * on arrival meant opening the page wrote a secret to the device and showed
	 * it, for someone who had not yet written a word.
	 */
	load(): void {
		const stored = read(KEYS.code);
		this.code = stored ? normaliseCode(stored) : null;

		this.#etag = read(KEYS.version);
		this.#lastSynced = parseDoc(read(KEYS.synced) ?? '');
		this.refresh();
	}

	/**
	 * Recomputes the mark. Cheap, and called after every edit.
	 *
	 * It must not touch `now`. This runs inside an effect that depends on the
	 * document, and a `$state` setter reads the old value to compare — so
	 * writing the clock here made the effect both read and write `now`, and
	 * since `Date.now()` differs every time it never settled. Svelte tore the
	 * whole tree's reactivity down with effect_update_depth_exceeded, which is
	 * why a completed join left the menu sitting open, doing nothing.
	 *
	 * The clock belongs to whatever is showing the cooldown tick down.
	 */
	refresh(): void {
		const noNetwork = typeof navigator !== 'undefined' && navigator.onLine === false;

		if (noNetwork || this.#unreachable) {
			this.status = 'offline';
			return;
		}
		this.status = this.unsent === 0 && this.#lastSynced !== null ? 'synced' : 'pending';
	}

	/**
	 * Joins someone else's list. The caller decides first whether to carry the
	 * local tasks across or discard them — never silently.
	 */
	async join(input: string, keep: boolean): Promise<SyncOutcome | null> {
		const code = normaliseCode(input);
		if (!code) return null;

		this.code = code;
		write(KEYS.code, code);

		this.#room = null;
		this.#etag = null;
		this.#lastSynced = null;
		remove(KEYS.version);
		remove(KEYS.synced);

		if (!keep) sheet.replace({ v: 1, groups: {}, tasks: {} });

		return await this.sync({ force: true });
	}

	/** Everything happens here, and only when someone asks for it. */
	async sync(options: { force?: boolean } = {}): Promise<SyncOutcome | null> {
		if (this.busy) return null;
		if (!options.force && this.cooling) return null;

		/*
		 * The first sync is where a code comes from. Written down before the
		 * request rather than after it: a PUT that lands while the confirming
		 * read fails leaves a list on the server, and forgetting the code it is
		 * under would strand it there with no way back to it.
		 */
		if (!this.code) {
			this.code = newCode();
			write(KEYS.code, this.code);
			void persist();
		}

		this.busy = true;
		this.message = null;

		try {
			// Derived lazily: PBKDF2 at 300,000 iterations is deliberately slow, so
			// its cost lands on an explicit tap rather than on first paint.
			this.#room ??= await derive(this.code);

			const outcome = await syncNow({
				roomId: this.#room.roomId,
				key: this.#room.key,
				local: sheet.doc,
				etag: this.#etag,
				lastSynced: this.#lastSynced
			});

			this.#apply(outcome);
			return outcome;
		} finally {
			this.busy = false;
			this.lastSyncAt = Date.now();
			this.now = Date.now();
		}
	}

	/** DELETE: forgets the list, the code and the key. Touches nothing remote. */
	forget(): void {
		for (const key of [KEYS.doc, KEYS.code, KEYS.version, KEYS.synced, KEYS.collapsed]) {
			remove(key);
		}

		this.#room = null;
		this.#etag = null;
		this.#lastSynced = null;
		this.#unreachable = false;
		// Back to a device that has never synced: no code until there is a list
		// and a sync to put it under.
		this.code = null;

		sheet.forget();
		sheet.load();
		this.refresh();
	}

	#apply(outcome: SyncOutcome): void {
		if (outcome.status === 'synced') {
			sheet.replace(outcome.doc);

			// Reaching it is the only thing that proves it can be reached.
			this.#unreachable = false;
			this.#lastSynced = outcome.doc;
			this.#etag = `"${outcome.v}"`;
			write(KEYS.version, this.#etag);
			write(KEYS.synced, canonical(outcome.doc));

			this.status = 'synced';
			return;
		}

		this.#unreachable = outcome.status === 'offline';
		this.status = this.#unreachable ? 'offline' : 'pending';
		this.message = messageFor(outcome);
	}
}

function messageFor(outcome: SyncOutcome): string | null {
	switch (outcome.status) {
		case 'offline':
			return 'Couldn’t reach the list — your changes are saved here.';
		case 'refused':
			// Naming the code is the point: it is the only thing that says whether
			// the route is missing or its store is.
			return `The list’s server answered ${outcome.code}. Nothing here was lost.`;
		case 'wrong-code':
			return 'That code doesn’t match a list.';
		case 'damaged':
			return 'That list looks damaged.';
		case 'too-large':
			return 'This list is too big to send — clear some.';
		case 'busy':
			return 'Couldn’t sync — try again in a moment.';
		default:
			return null;
	}
}

/** How many records differ from the last version that reached the server. */
export function countUnsent(local: Doc, synced: Doc | null): number {
	if (!synced) {
		return (
			Object.values(local.tasks).filter((t) => !t.deleted).length +
			Object.values(local.groups).filter((g) => !g.deleted).length
		);
	}

	let count = 0;

	for (const [id, task] of Object.entries(local.tasks)) {
		if (canonical(task) !== canonical(synced.tasks[id])) count++;
	}
	for (const [id, group] of Object.entries(local.groups)) {
		if (canonical(group) !== canonical(synced.groups[id])) count++;
	}

	return count;
}

export const sync = new SyncState();
