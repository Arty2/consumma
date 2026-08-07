/**
 * Seeded randomness, so a line drawn from the same seed is the same line every
 * time.
 *
 * This matters more than it looks. Seeds come from stable ids — the sheet from
 * the room id, a task's box from its task id — so nothing re-jitters on a
 * keystroke or a re-render, and two people looking at the same list see the
 * same drawing.
 */

/** mulberry32: small, fast, and good enough for wobbling a line. */
export function rng(seed: number): () => number {
	let a = seed >>> 0;

	return () => {
		a = (a + 0x6d2b79f5) >>> 0;
		let t = a;
		t = Math.imul(t ^ (t >>> 15), t | 1);
		t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
		return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
	};
}

/** FNV-1a, so any stable string can seed a drawing. */
export function seedFrom(value: string): number {
	let hash = 0x811c9dc5;

	for (let i = 0; i < value.length; i++) {
		hash ^= value.charCodeAt(i);
		hash = Math.imul(hash, 0x01000193);
	}

	return hash >>> 0;
}
