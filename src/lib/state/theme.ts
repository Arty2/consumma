/**
 * Which of the two colours the sheet is drawn in, and who decides.
 *
 * The palette is still #000 and #fff (§6); what a theme changes is which of
 * them is the paper. Dark is the straight inversion and nothing else — no
 * greys appear at the far end of it.
 *
 * This is a property of the device, not of the list. It is never synced, never
 * exported, and DELETE does not clear it: someone who removes a list from a
 * phone has not changed their mind about how the phone should look.
 */
export type Theme = 'dark' | 'light' | 'system';

/** What the phone is doing, and therefore what `system` comes out as. */
export type Scheme = 'dark' | 'light';

/**
 * Absent, unreadable, or from a later version of this app: follow the phone.
 *
 * `system` is never written down — see below — so it only arrives here as
 * something to be ignored.
 */
export function parseTheme(raw: string | null): Theme {
	return raw === 'dark' || raw === 'light' ? raw : 'system';
}

export function resolveTheme(choice: Theme, system: Scheme): Scheme {
	return choice === 'system' ? system : choice;
}

/**
 * Where the next tap goes: the opposite of the phone, then the one that agrees
 * with it, then back to following it.
 *
 * The first step is the opposite rather than a fixed dark-then-light, because
 * the tap that changes nothing on screen is the tap that reads as a broken
 * button — and on a dark phone, "dark" first is exactly that tap.
 *
 * Which way round it goes therefore depends on the phone, and moves with it: a
 * phone that turns dark at dusk turns this around with it, mid-cycle.
 */
export function nextTheme(choice: Theme, system: Scheme): Theme {
	const opposite: Scheme = system === 'dark' ? 'light' : 'dark';

	if (choice === 'system') return opposite;
	if (choice === opposite) return system;

	return 'system';
}
