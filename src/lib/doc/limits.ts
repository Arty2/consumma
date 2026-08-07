/**
 * Enforced on the way in, never in merge (§4).
 *
 * If two people each add offline and the union crosses a count, merge keeps
 * everything: dropping someone's task to satisfy a counter is worse than being
 * over by three. The sheet says so quietly and the add row goes away until it
 * is back under.
 *
 * Counts are code points, not UTF-16 units, so an emoji costs one character
 * rather than two.
 */
export const LIMITS = {
	/** Characters in a task, counted in code points. */
	taskText: 100,
	/** Live tasks in a list, excluding tombstones. */
	tasks: 100,
	/** Characters in a group title, counted in code points. */
	groupTitle: 50,
	/** Live groups in a list, excluding tombstones. */
	groups: 20,
	/** Encrypted blob, rejected by the server above this. */
	blobBytes: 128 * 1024,
	/** Decrypted plaintext, refused before JSON.parse ever sees it. */
	plaintextBytes: 1024 * 1024
} as const;

/** The character counter appears at this length, and not before. */
export const COUNTER_APPEARS_AT = 80;
