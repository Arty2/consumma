import { clearTrace, onTrace, setTracing, traceEntries } from '$lib/sync/trace';
import { KEYS, read, remove, write } from './storage';

/**
 * The reactive face of src/lib/sync/trace.ts — off by default, and turning
 * it off clears what was kept, the same as every other thing in the menu
 * that takes something away.
 *
 * Not a list setting: it is about this device's own attempts to reach the
 * server, not about any one remembered list, so it stays a single flat key
 * regardless of how many lists exist.
 */
export class Diagnostics {
	enabled = $state(false);
	entries: string[] = $state([]);

	load(): void {
		this.enabled = read(KEYS.diagnostics) === '1';
		setTracing(this.enabled);
		this.entries = [...traceEntries()];

		onTrace(() => {
			this.entries = [...traceEntries()];
		});
	}

	toggle(): void {
		this.enabled = !this.enabled;

		if (this.enabled) write(KEYS.diagnostics, '1');
		else remove(KEYS.diagnostics);

		setTracing(this.enabled);
		this.entries = [];
	}

	clear(): void {
		clearTrace();
		this.entries = [];
	}
}

export const diagnostics = new Diagnostics();
