import { browser } from '$app/environment';
import { diagnostics } from '$lib/state/diagnostics.svelte';
import { el } from './el';
import { en } from './en';
import type { Messages } from './en';
import { detectLocale, resolveLocale, type Locale } from './locales';

const CATALOGUES: Record<Locale, Messages> = { en, el };

/**
 * Which catalogue the app is showing, and the one thing that can override it.
 *
 * `detected` is read once, from the browser the tab is running in, and read
 * at construction rather than through a `load()` called from an effect: the
 * scaffolding group's title (see `firstGroupTitle` in doc.svelte.ts) is
 * created from *its own* mount effect, in a sibling component, and nothing
 * orders one component's effects before another's. Detecting eagerly, the
 * moment this module is first imported, means every later reader — effect,
 * template, or a plain function called during another module's own setup —
 * sees the real answer immediately, with nothing to race. `navigator` needs
 * no lifecycle to be ready; only the DOM does, which is what `theme.svelte.ts`
 * and the others with a genuine `load()` are actually waiting for.
 *
 * `override` is the debug picker's doing, and it is deliberately not written
 * to storage: it lives for as long as this tab does, the same reasoning
 * Menu.svelte's own `remembered` scroll position is held to. Someone testing
 * a translation reaches for the picker once each time they open debug; a
 * choice that survived a reload would be a second kind of state to explain
 * next to the one the switch itself already keeps.
 */
export class Language {
	#detected = $state<Locale>(
		browser ? detectLocale(navigator.languages ?? [navigator.language]) : 'en'
	);
	override = $state<Locale | null>(null);

	current = $derived(resolveLocale(this.#detected, this.override, diagnostics.enabled));
	catalogue = $derived(CATALOGUES[this.current]);
}

export const language = new Language();
