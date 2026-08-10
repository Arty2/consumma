import { browser } from '$app/environment';
import { KEYS, read, remove, write } from './storage';
import { nextTheme, parseTheme, resolveTheme, type Scheme, type Theme } from './theme';

/**
 * The theme, and what the phone would like it to be.
 *
 * Two pieces of state rather than one: `resolved` is what the sheet is drawn
 * in, but `choice` is what the button reports, and following a dark phone has
 * to look different from having picked dark on one.
 */
export class ThemeSetting {
	choice = $state<Theme>('system');
	system = $state<Scheme>('light');

	resolved = $derived(resolveTheme(this.choice, this.system));

	/**
	 * Once, on mount. The listener is never taken off again — this is a
	 * page-lifetime singleton, and there is nothing after it to leak into.
	 */
	load(): void {
		this.choice = parseTheme(read(KEYS.theme));
		if (!browser) return;

		const query = window.matchMedia('(prefers-color-scheme: dark)');
		this.system = query.matches ? 'dark' : 'light';

		// A phone that turns dark at dusk turns the sheet with it — and turns
		// the cycle around, since which way the button goes first is measured
		// against this.
		query.addEventListener('change', (event) => {
			this.system = event.matches ? 'dark' : 'light';
		});
	}

	/**
	 * Going back to following the phone removes the key rather than writing
	 * `system` into it.
	 *
	 * Arriving writes nothing, and this is the same fact from the other end: a
	 * device that has been set back to the default is one that has nothing set,
	 * and there is no reason for it to keep saying so.
	 */
	cycle(): Theme {
		this.choice = nextTheme(this.choice, this.system);

		if (this.choice === 'system') remove(KEYS.theme);
		else write(KEYS.theme, this.choice);

		return this.choice;
	}
}

export const theme = new ThemeSetting();
