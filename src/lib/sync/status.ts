import type { SyncStatus } from '$lib/state/sync.svelte';

/*
 * What the menu says about syncing.
 *
 * Two facts get confused if they share a sentence: how much is waiting to go,
 * and whether the list could be reached last time we tried. The first is the
 * one people actually want; the second is a condition, not a failure, and
 * saying only "Offline" invites reading it as one.
 *
 * So they are separate lines, and the count is always shown — the old copy
 * dropped it whenever the connection was down, which is exactly when someone
 * most wants to know how much is at stake.
 */

export type StatusText = {
	/** How much is waiting. Always present. */
	headline: string;
	/** Why it is still waiting, when there is a reason worth naming. */
	detail: string | null;
};

/** Nothing here is an error; `sync.message` carries those separately. */
export function statusText(status: SyncStatus, unsent: number): StatusText {
	const waiting =
		unsent === 0
			? null
			: unsent === 1
				? '1 change is waiting to go.'
				: `${unsent} changes are waiting to go.`;

	if (status === 'offline') {
		return {
			headline: waiting ?? 'Nothing is waiting to go.',
			detail: 'The list could not be reached last time. Everything is safe on this device.'
		};
	}

	if (waiting) {
		return {
			headline: waiting,
			detail: 'Nobody else can see them until you sync.'
		};
	}

	// Never synced and nothing to send: an empty list on a fresh device.
	if (status === 'pending') {
		return { headline: 'Nothing is waiting to go.', detail: null };
	}

	return { headline: 'Everything is synced.', detail: null };
}
