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
	taskText: 200,
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

/**
 * How close to the limit a row gets before it says so.
 *
 * A count, not a length, so it does not have to be retuned every time the
 * limit moves. Past the limit the row does not stop accepting characters —
 * it fills up and the rest starts the next row (see doc/spill.ts) — so this
 * is a last stretch of page rather than a warning.
 */
export const COUNTER_WITHIN = 20;
