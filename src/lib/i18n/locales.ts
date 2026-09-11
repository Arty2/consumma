/*
 * Which catalogues exist, and the two small decisions that sit above any one
 * of them: which language a browser is asking for, and which of the two
 * language and debug-state count as "the app should actually show it".
 *
 * Nothing here is translated, deliberately. `LOCALE_NAMES` is what a picker
 * offering a language shows for it, and every phone that offers a language
 * list shows each one in its own script — a Greek reader choosing between
 * "English" and "Greek" is being asked to read the language they cannot to
 * find the one they can. It is the same reasoning that leaves `doc.firstGroup`
 * out of most of the catalogue: a name is not run through itself.
 */

/** Every catalogue this app actually has. Add to this the day a third exists. */
export const SUPPORTED_LOCALES = ['en', 'el'] as const;

export type Locale = (typeof SUPPORTED_LOCALES)[number];

/** Each language's own name for itself, in its own script. */
export const LOCALE_NAMES: Record<Locale, string> = {
	en: 'English',
	el: 'Ελληνικά'
};

function isSupported(tag: string): tag is Locale {
	return (SUPPORTED_LOCALES as readonly string[]).includes(tag);
}

/**
 * The first of the browser's own languages, in the order it prefers them,
 * that this app has a catalogue for — matched on the primary subtag alone,
 * so `el-GR` and `el-CY` both want the Greek catalogue. English whenever
 * nothing offered matches, which is both the fallback and, today, the only
 * other catalogue there is.
 */
export function detectLocale(languages: readonly string[]): Locale {
	for (const tag of languages) {
		const primary = tag.slice(0, 2).toLowerCase();
		if (isSupported(primary)) return primary;
	}

	return 'en';
}

/**
 * Which catalogue is actually shown: the debug picker's choice while debug is
 * on, the detected one otherwise.
 *
 * The picker is not on the panel until debug is — see diagnostics.svelte.ts —
 * and turning debug back off has to put the language back with it, or the one
 * control that reaches it is gone and a browser that had already guessed
 * right is stuck showing whatever was being previewed. Nothing is cleared to
 * get that: the override just stops being read, so switching debug on again
 * in the same tab picks up the same preview rather than asking again.
 */
export function resolveLocale(detected: Locale, override: Locale | null, debugOn: boolean): Locale {
	return debugOn && override !== null ? override : detected;
}
