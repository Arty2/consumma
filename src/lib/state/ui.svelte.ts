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
	/**
	 * On its way out, and still on screen for as long as it takes.
	 *
	 * A message that blinks out is one you are never sure you saw, so it leaves
	 * the way it arrived — up past the top of the paper. That needs the node to
	 * stay in the document while the animation runs, which means the toast
	 * cannot simply be set to null; `gone()` is what actually removes it, and
	 * the component calls it when the movement ends.
	 */
	leaving = $state(false);
	/** Announced to screen readers after a keyboard move. */
	announcement = $state('');
	loaded = $state(false);

	#key: string = KEYS.collapsed;
	#timer: ReturnType<typeof setTimeout> | null = null;

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

		this.leaving = false;
		this.toast = { text, undo };
		this.#timer = setTimeout(() => this.dismiss(), undo ? 10_000 : 4_000);
	}

	/**
	 * Start it leaving. The component takes it from here and says when it has.
	 *
	 * `now` is for the callers that cannot wait for a movement: an undo replaces
	 * what the message was about, so the message goes with it rather than
	 * sliding out over the change it just described.
	 */
	dismiss(now = false): void {
		if (this.#timer) clearTimeout(this.#timer);
		this.#timer = null;

		if (now || this.toast === null) {
			this.gone();
			return;
		}

		this.leaving = true;
	}

	/** Actually off the screen: the movement ended, or there was never one. */
	gone(): void {
		this.leaving = false;
		this.toast = null;
	}

	announce(text: string): void {
		this.announcement = text;
	}
}

export const ui = new Ui();
