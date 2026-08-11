import { KEYS, readJson, writeJson, type ListKeySet } from './storage';

export type Toast = {
	text: string;
	/** Present only while an action is still reversible. */
	undo?: () => void;
};

/**
 * Everything on screen that is not the document.
 *
 * Collapsed state lives here rather than in the document: your collapsing a
 * group must not collapse it on the other person's phone (§4). It is
 * per-list for the same reason a code and a doc are: collapsing a group on
 * one remembered list must not collapse a same-shaped group on another.
 */
export class Ui {
	collapsed = $state<Record<string, boolean>>({});
	toast = $state<Toast | null>(null);
	/** Announced to screen readers after a keyboard move. */
	announcement = $state('');
	loaded = $state(false);

	#key: string = KEYS.collapsed;
	#timer: ReturnType<typeof setTimeout> | null = null;
	/** Consummatum fires once, and not again until something is finished anew. */
	#celebrated = false;

	load(): void {
		if (this.loaded) return;
		this.loaded = true;
		this.#loadFrom(KEYS.collapsed);
	}

	/** Re-points collapsed state at a different list's key. */
	switchTo(keys: ListKeySet): void {
		this.loaded = true;
		this.#loadFrom(keys.collapsed);
	}

	#loadFrom(key: string): void {
		this.#key = key;
		this.collapsed = readJson<Record<string, boolean>>(key, {});
	}

	isCollapsed(groupId: string): boolean {
		return this.collapsed[groupId] === true;
	}

	toggleCollapsed(groupId: string): void {
		this.collapsed = { ...this.collapsed, [groupId]: !this.isCollapsed(groupId) };
		writeJson(this.#key, this.collapsed);
	}

	expand(groupId: string): void {
		if (!this.isCollapsed(groupId)) return;
		this.collapsed = { ...this.collapsed, [groupId]: false };
		writeJson(this.#key, this.collapsed);
	}

	say(text: string, undo?: () => void): void {
		if (this.#timer) clearTimeout(this.#timer);

		this.toast = { text, undo };
		this.#timer = setTimeout(() => this.dismiss(), undo ? 10_000 : 4_000);
	}

	dismiss(): void {
		if (this.#timer) clearTimeout(this.#timer);
		this.#timer = null;
		this.toast = null;
	}

	announce(text: string): void {
		this.announcement = text;
	}

	/**
	 * The one flourish. Called after every state change; fires only on the
	 * transition into "everything on the sheet is done", and not on an empty
	 * sheet.
	 */
	celebrate(finished: boolean): void {
		if (!finished) {
			this.#celebrated = false;
			return;
		}
		if (this.#celebrated) return;

		this.#celebrated = true;
		this.say('Consummatum');
	}
}

export const ui = new Ui();
