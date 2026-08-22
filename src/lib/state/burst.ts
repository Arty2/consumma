/**
 * A run of ticks, noticed.
 *
 * Ticking one thing off is the app working. Ticking three off inside a few
 * seconds is somebody at the end of a shop, going down the list — and what
 * they want next is those rows gone, which is the one thing the sheet used to
 * make them go into the menu for.
 *
 * So the run is watched here and nowhere else, and it is watched by counting
 * rather than by reading the document: a stamp says when a task was last
 * changed, not that it was changed as part of anything. `now` is passed in
 * rather than read, so this is a plain object with no clock of its own and the
 * test can hold the window still.
 */

/** How long a run may take and still be one run. */
export const BURST_WITHIN = 5_000;

/**
 * How many make a run.
 *
 * Two is a pair, which happens all day and would put a message on the screen
 * for it. Three inside five seconds is somebody working down a list.
 */
export const BURST_COUNT = 3;

type Tick = { id: string; at: number };

export class Burst {
	#run: Tick[] = [];

	/**
	 * A task has just been ticked. Returns the run, once there is one — and
	 * forgets it in the same breath, so one run raises one offer and a fourth
	 * tick starts counting again rather than asking a second time.
	 *
	 * The same task ticked twice is one tick: it can only be ticked twice by
	 * having been un-ticked in between, and changing your mind about one row is
	 * not the run this is looking for.
	 */
	note(id: string, now: number): string[] | null {
		this.#run = this.#run.filter((tick) => tick.id !== id && now - tick.at < BURST_WITHIN);
		this.#run.push({ id, at: now });

		if (this.#run.length < BURST_COUNT) return null;

		const run = this.#run.map((tick) => tick.id);
		this.#run = [];
		return run;
	}

	/** Anything that is not a tick ends the run — an un-tick most of all. */
	forget(): void {
		this.#run = [];
	}
}
