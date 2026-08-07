import { isId, newId } from '$lib/doc/id';
import * as ops from '$lib/doc/ops';
import { between } from '$lib/doc/order';
import { createClock, type Ctx } from '$lib/doc/stamp';
import { emptyDoc, type Doc, type State } from '$lib/doc/types';
import { parseDoc } from '$lib/doc/validate';
import { allDone, openCount, view, type ViewGroup } from '$lib/doc/view';
import { KEYS, read, write } from './storage';

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

	#ctx: Ctx | null = null;

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

		this.doc = parseDoc(read(KEYS.doc) ?? '') ?? emptyDoc();
		this.loaded = true;

		// A fresh sheet is one untitled group holding one empty checkbox. Every
		// task belongs to a group, so nothing else in the app has to special-case
		// the empty state.
		if (ops.liveGroups(this.doc).length === 0) this.addGroup('');
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

	// ── tasks ───────────────────────────────────────────────────────────────

	addTask(groupId: string, text: string): string | null {
		const id = newId();
		return this.#apply((doc, ctx) => ops.addTask(doc, ctx, { id, groupId, text })) ? id : null;
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

	#save(): void {
		write(KEYS.doc, JSON.stringify(this.doc));
		if (this.#ctx) write(KEYS.lastT, String(this.#ctx.clock.last()));
	}

	#clientId(): string {
		const existing = read(KEYS.clientId);
		if (existing && isId(existing)) return existing;

		const id = newId();
		write(KEYS.clientId, id);
		return id;
	}
}

export const sheet = new Sheet();
