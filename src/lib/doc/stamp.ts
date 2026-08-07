import type { Stamp } from './types';

/**
 * A per-device monotonic clock.
 *
 * Merge tie-breaks on `t` then `c`, so two edits from the same device in the
 * same millisecond would otherwise produce identical stamps for different
 * values — and merge would stop being commutative. Guaranteeing that one
 * device never issues the same `t` twice makes `(t, c)` a total order.
 *
 * The last value is persisted alongside the client id, so a reload cannot
 * hand out a `t` the device has already used.
 */
export type Clock = {
	/** The next stamp time. Strictly greater than every previous one. */
	next(): number;
	/** The last time handed out, for persisting. */
	last(): number;
	/** Restore from storage. Never moves the clock backwards. */
	seed(t: number): void;
};

export function createClock(seed = 0, source: () => number = Date.now): Clock {
	let last = seed;

	return {
		next() {
			last = Math.max(source(), last + 1);
			return last;
		},
		last() {
			return last;
		},
		seed(t) {
			if (Number.isFinite(t) && t > last) last = t;
		}
	};
}

/** Identifies one device. Random, per device, and not secret. */
export type Ctx = { clientId: string; clock: Clock };

export function stamp(ctx: Ctx): Stamp {
	return { t: ctx.clock.next(), c: ctx.clientId };
}
