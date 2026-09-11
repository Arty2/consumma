import { language } from './language.svelte';
import type { Messages } from './en';

export type { Messages } from './en';

/**
 * Everything the app says, as one object.
 *
 * `t` reads through to whichever catalogue `language.catalogue` currently
 * holds — the browser's own language by default, or the debug picker's
 * choice while debug is on (see language.svelte.ts). A component still
 * writes `t.task.delete` exactly as it did when there was only English: the
 * indirection is a `Proxy` rather than a lookup table keyed by section, so
 * every read forwards straight to the live catalogue and nothing here has to
 * know the catalogue's shape to do it.
 *
 * The `get` trap is what makes this reactive rather than merely convenient:
 * `language.catalogue` is a `$derived` read at the moment each property is
 * asked for, inside whatever template or effect is asking, so Svelte tracks
 * the dependency there and re-renders when the language changes — the same
 * way any other computed reactive value would, wherever it is read from.
 */
export const t: Messages = new Proxy({} as Messages, {
	get: (_target, property: string) => Reflect.get(language.catalogue, property)
});
