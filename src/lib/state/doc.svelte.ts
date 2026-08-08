import { isId, newId } from '$lib/doc/id';
import * as ops from '$lib/doc/ops';
import { between } from '$lib/doc/order';
import { createClock, type Ctx } from '$lib/doc/stamp';
import { emptyDoc, type Doc, type State } from '$lib/doc/types';
import { parseDoc } from '$lib/doc/validate';
import { allDone, openCount, view, type ViewGroup } from '$lib/doc/view';
import { KEYS, persist, read, write } from './storage';

/** What the first group is called until someone renames it. */
export const FIRST_GROUP = 'My list';

/**
 * The document, in runes, backed by localStorage.
 *
 * Writes land locally first and always — the app is fully usable with no
 * network, and sync is something the person asks for rather than something
 * that happens to them (see src/lib/sync).
 */
export class Sheet {
	doc = $state<Doc>(emptyDoc());
	loaded = $state(false);
	/**
	 * Whether anything has ever been written on this sheet.
	 *
	 * A sheet arrives with one group on it, and that group is scaffolding — it
	 * is not something anyone put there, and counting it made the app tell a
	 * visitor who had done nothing that one change was waiting to go.
	 */
	written = $state(false);

	#ctx: Ctx | null = null;
	/*
	 * Set while the opening group is being put in place. A sheet arrives with
	 * one group already on it, and that is scaffolding rather than something
	 * anyone wrote — writing it to storage would mean opening the page left a
	 * trace on the device without a single tap.
	 */
	#quiet = false;
	/** Asked for once, the first time there is anything worth keeping. */
	#asked = false;

	groups: ViewGroup[] = $derived(view(this.doc));
	taskCount: number = $derived(ops.countTasks(this.doc));
	groupCount: number = $derived(ops.countGroups(this.doc));
	canAddTask: boolean = $derived(ops.canAddTask(this.doc));
	canAddGroup: boolean = $derived(ops.canAddGroup(this.doc));
	doneCount: number = $derived(ops.doneTasks(this.doc).length);
	open: number = $derived(openCount(this.doc));
	finished: boolean = $derived(allDone(this.doc));

	/** Called once the browser exists. Until then the sheet is empty. */
	load(): void {
		if (this.loaded) return;

		this.#ctx = {
			clientId: this.#clientId(),
			clock: createClock(Number(read(KEYS.lastT) ?? 0))
		};

		const stored = read(KEYS.doc);
		this.doc = parseDoc(stored ?? '') ?? emptyDoc();
		this.written = stored !== null;
		this.loaded = true;

		/*
		 * A fresh sheet is one group holding one empty checkbox. Every task
		 * belongs to a group, so nothing else in the app has to special-case the
		 * empty state.
		 *
		 * Stored in sentence case and displayed in caps, like every other title:
		 * the uppercase is CSS only, so the markdown export reads "## My list"
		 * rather than shouting.
		 *
		 * Quietly: it is the shape of an empty sheet, not something anyone put
		 * there. It reaches storage on the first real edit, along with everything
		 * else.
		 */
		if (ops.liveGroups(this.doc).length === 0) {
			this.#quiet = true;
			this.addGroup(FIRST_GROUP);
			this.#quiet = false;
		}
	}

	/** Replaces the whole document — used by sync and by import's replace path. */
	replace(doc: Doc): void {
		this.doc = doc;
		this.#save();
	}

	get ctx(): Ctx | null {
		return this.#ctx;
	}

	// ── groups ──────────────────────────────────────────────────────────────

	addGroup(title: string): string | null {
		const id = newId();
		return this.#apply((doc, ctx) => ops.addGroup(doc, ctx, { id, title })) ? id : null;
	}

	renameGroup(id: string, title: string): void {
		this.#apply((doc, ctx) => ops.renameGroup(doc, ctx, id, title));
	}

	moveGroup(id: string, order: string): void {
		this.#apply((doc, ctx) => ops.moveGroup(doc, ctx, id, order));
	}

	/**
	 * Removes a group and its tasks. The header only offers it once every task
	 * in the group is done, so nothing anyone is still waiting on goes with it.
	 *
	 * Returns what went, so the toast can offer it back.
	 */
	deleteGroup(id: string): { id: string; tasks: { id: string; text: string }[] } | null {
		const group = this.doc.groups[id];
		if (!group || group.deleted) return null;

		const tasks = ops.liveTasks(this.doc, id).map((t) => ({ id: t.id, text: t.text }));
		this.#apply((doc, ctx) => ops.deleteGroup(doc, ctx, id));

		return { id, tasks };
	}

	/** Undo for the above: the group first, then everything that was in it. */
	restoreGroup(entry: { id: string; tasks: readonly { id: string; text: string }[] }): void {
		this.#apply((doc, ctx) =>
			ops.restoreTasks(ops.restoreGroup(doc, ctx, entry.id), ctx, entry.tasks)
		);
	}

	// ── tasks ───────────────────────────────────────────────────────────────

	addTask(groupId: string, text: string): string | null {
		const id = newId();
		return this.#apply((doc, ctx) => ops.addTask(doc, ctx, { id, groupId, text })) ? id : null;
	}

	/**
	 * The same, at a position rather than on the end — Enter on a task opens a
	 * fresh one directly beneath it.
	 */
	addTaskAt(groupId: string, index: number, text: string): string | null {
		const id = newId();
		const order = this.orderAt(groupId, index);

		return this.#apply((doc, ctx) => ops.addTask(doc, ctx, { id, groupId, text, order }))
			? id
			: null;
	}

	/**
	 * The same again, placed after a given order rather than at an index.
	 *
	 * Loose ends needs this. Its tasks are gathered from across the document
	 * and can carry several dead group ids between them, so `liveTasks` for any
	 * one of those ids is not the list on screen and an index into it means
	 * nothing — only the tasks under the heading know where the end of it is.
	 */
	addTaskAfter(groupId: string, text: string, after: string | null): string | null {
		const id = newId();
		const order = between(after, null);

		return this.#apply((doc, ctx) => ops.addTask(doc, ctx, { id, groupId, text, order }))
			? id
			: null;
	}

	editTask(id: string, text: string): void {
		this.#apply((doc, ctx) => ops.editTask(doc, ctx, id, text));
	}

	setState(id: string, state: State): void {
		this.#apply((doc, ctx) => ops.setTaskState(doc, ctx, id, state));
	}

	moveTask(id: string, groupId: string, order: string): void {
		this.#apply((doc, ctx) => ops.moveTask(doc, ctx, id, { groupId, order }));
	}

	deleteTask(id: string): { id: string; text: string } | null {
		const task = this.doc.tasks[id];
		if (!task || task.deleted) return null;

		const entry = { id, text: task.text };
		this.#apply((doc, ctx) => ops.deleteTask(doc, ctx, id));
		return entry;
	}

	/** CLEAR. Returns what went, so the toast can offer it back. */
	clearDone(): { id: string; text: string }[] {
		if (!this.#ctx) return [];

		const { doc, cleared } = ops.clearDone(this.doc, this.#ctx);
		if (cleared.length === 0) return [];

		this.doc = doc;
		this.#save();
		return cleared;
	}

	restore(entries: readonly { id: string; text: string }[]): void {
		this.#apply((doc, ctx) => ops.restoreTasks(doc, ctx, entries));
	}

	/** Wipes this device. Touches nothing on the server. */
	forget(): void {
		this.doc = emptyDoc();
		this.loaded = false;
		this.written = false;
		this.#ctx = null;
	}

	// ── ordering helpers ────────────────────────────────────────────────────

	/**
	 * The fractional index for dropping a task at `index` within a group,
	 * ignoring the task being moved so it does not compare against itself.
	 */
	orderAt(groupId: string, index: number, movingId?: string): string {
		const siblings = ops
			.liveTasks(this.doc, groupId)
			.filter((t) => t.id !== movingId)
			.map((t) => t.order);

		const before = index > 0 ? (siblings[index - 1] ?? null) : null;
		const after = siblings[index] ?? null;
		return between(before, after);
	}

	groupOrderAt(index: number, movingId?: string): string {
		const siblings = ops
			.liveGroups(this.doc)
			.filter((g) => g.id !== movingId)
			.map((g) => g.order);

		const before = index > 0 ? (siblings[index - 1] ?? null) : null;
		const after = siblings[index] ?? null;
		return between(before, after);
	}

	// ── internals ───────────────────────────────────────────────────────────

	#apply(fn: (doc: Doc, ctx: Ctx) => Doc): boolean {
		if (!this.#ctx) return false;

		const next = fn(this.doc, this.#ctx);
		if (next === this.doc) return false;

		this.doc = next;
		this.#save();
		return true;
	}

	/**
	 * The one place this device writes anything down.
	 *
	 * Nothing here runs until something has actually been written on the sheet:
	 * arriving at the page and leaving again has to be indistinguishable from
	 * never having come. The client id goes down with the first save rather
	 * than when it is made, for the same reason.
	 */
	#save(): void {
		if (this.#quiet) return;
		this.written = true;

		if (this.#ctx) {
			write(KEYS.clientId, this.#ctx.clientId);
			write(KEYS.lastT, String(this.#ctx.clock.last()));
		}
		write(KEYS.doc, JSON.stringify(this.doc));

		// There is a list now, so it is worth asking not to be evicted.
		if (!this.#asked) {
			this.#asked = true;
			void persist();
		}
	}

	/** Not written down here — `#save` does that once there is a reason to. */
	#clientId(): string {
		const existing = read(KEYS.clientId);
		return existing && isId(existing) ? existing : newId();
	}
}

export const sheet = new Sheet();
