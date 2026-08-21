import { en } from './en';

/**
 * Everything the app says, as one object.
 *
 * `t` is a reference to the English catalogue and nothing more — no lookup, no
 * key parsing, no fallback chain. A component reads `t.task.delete` the way it
 * would read any other constant, so a missing string is a type error at build
 * time rather than a `???` on somebody's screen.
 *
 * When there is a second language, this is the file that grows: `t` becomes a
 * `$derived` off a stored preference and the catalogues are selected here. The
 * components do not change, because they never knew there was only one.
 */
export const t = en;

/**
 * The shape every catalogue has to have.
 *
 * Derived from the English one rather than declared beside it, so the two can
 * never disagree: adding a string to `en.ts` immediately makes every other
 * catalogue incomplete, and TypeScript says which one and where. There is only
 * one catalogue today, and this is what makes the second one cheap.
 */
export type Messages = typeof en;
