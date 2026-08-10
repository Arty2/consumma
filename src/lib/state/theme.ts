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
 * Where the next tap goes: away from the phone, and back to it.
 *
 * Two states, not three. The third was the one that agreed with the phone —
 * picking "light" on a light phone — and it is a state with nothing to show
 * for itself: the sheet is identical to following, so the whole of what a tap
 * did was move a glyph nobody was looking at. Between them, two taps in a row
 * appeared to do nothing at all.
 *
 * What is left is the pair anybody actually wants: the phone's idea, and the
 * other one. The opposite rather than a fixed dark-then-light, because the tap
 * that changes nothing on screen is the tap that reads as a broken button —
 * and on a dark phone, "dark" first is exactly that tap.
 *
 * Which way round it goes therefore depends on the phone, and moves with it: a
 * phone that turns dark at dusk turns this around with it. Someone holding the
 * opposite of a light phone is holding dark; when the phone goes dark at dusk
 * they are holding light, and one tap still returns them to following.
 */
export function nextTheme(choice: Theme, system: Scheme): Theme {
	if (choice === 'system') return system === 'dark' ? 'light' : 'dark';

	return 'system';
}
