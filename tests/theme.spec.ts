import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { KEYS } from '../src/lib/state/storage';
import {
	nextTheme,
	parseTheme,
	resolveTheme,
	type Scheme,
	type Theme
} from '../src/lib/state/theme';

/**
 * Taps the button `n` times from a starting choice, with the phone held at one
 * setting throughout.
 */
function cycle(from: Theme, system: Scheme, taps: number): Theme[] {
	const seen: Theme[] = [];
	let choice = from;

	for (let i = 0; i < taps; i++) {
		choice = nextTheme(choice, system);
		seen.push(choice);
	}

	return seen;
}

describe('parseTheme', () => {
	it('takes the two that are ever written down', () => {
		expect(parseTheme('dark')).toBe('dark');
		expect(parseTheme('light')).toBe('light');
	});

	it('falls back to following the phone for everything else', () => {
		// Nothing stored is the ordinary case: arriving writes nothing.
		expect(parseTheme(null)).toBe('system');
		expect(parseTheme('')).toBe('system');
		expect(parseTheme('Dark')).toBe('system');
		expect(parseTheme('{"choice":"dark"}')).toBe('system');

		// `system` is never written, but a later version of this app might, and
		// reading it back has to mean the same thing as not finding it.
		expect(parseTheme('system')).toBe('system');
	});
});

describe('resolveTheme', () => {
	it('answers with the phone only while nobody has chosen', () => {
		expect(resolveTheme('system', 'dark')).toBe('dark');
		expect(resolveTheme('system', 'light')).toBe('light');

		expect(resolveTheme('dark', 'light')).toBe('dark');
		expect(resolveTheme('light', 'dark')).toBe('light');
	});
});

describe('nextTheme', () => {
	/*
	 * The first tap has to change something on screen, or the button reads as
	 * broken. That is the whole reason the order is not fixed.
	 */
	it('goes to the opposite of the phone first, whichever way the phone is set', () => {
		expect(nextTheme('system', 'light')).toBe('dark');
		expect(nextTheme('system', 'dark')).toBe('light');
	});

	it('comes back round to following the phone in two', () => {
		expect(cycle('system', 'light', 2)).toStrictEqual(['dark', 'system']);
		expect(cycle('system', 'dark', 2)).toStrictEqual(['light', 'system']);
	});

	/*
	 * Two states, not three. The one that was dropped is the choice agreeing
	 * with the phone: it draws the same sheet as following does, so a tap into
	 * it and the tap out of it both looked like nothing happening.
	 */
	it('never settles on the choice that agrees with the phone', () => {
		for (const system of ['dark', 'light'] as const) {
			const seen = cycle('system', system, 8);

			expect(seen).not.toContain(system);
			expect(new Set(seen)).toStrictEqual(
				new Set([system === 'dark' ? 'light' : 'dark', 'system'])
			);
		}
	});

	it('keeps alternating, and nothing else', () => {
		for (const system of ['dark', 'light'] as const) {
			const seen = cycle('system', system, 8);

			expect(seen).toStrictEqual([
				...seen.slice(0, 2),
				...seen.slice(0, 2),
				...seen.slice(0, 2),
				...seen.slice(0, 2)
			]);
		}
	});

	/*
	 * The phone turning dark at dusk turns the cycle around under someone who
	 * is halfway through it. Wherever that leaves them, the next tap still has
	 * to be a state they are not already in.
	 */
	it('never sends a tap to where it already is', () => {
		for (const system of ['dark', 'light'] as const) {
			for (const choice of ['dark', 'light', 'system'] as const) {
				expect(nextTheme(choice, system), `${choice} on a ${system} phone`).not.toBe(choice);
			}
		}
	});

	/*
	 * With the third state gone, this is now true of every tap rather than only
	 * of the one leaving `system` — which is the whole point of dropping it.
	 */
	it('turns the sheet over on every tap, in both directions', () => {
		for (const system of ['dark', 'light'] as const) {
			const opposite = system === 'dark' ? 'light' : 'dark';

			// Leaving `system` inverts the sheet.
			expect(resolveTheme(nextTheme('system', system), system)).toBe(opposite);

			// And so does returning to it, because the only place to return from
			// is the opposite.
			expect(nextTheme(opposite, system)).toBe('system');
			expect(resolveTheme(nextTheme(opposite, system), system)).toBe(system);
		}
	});
});

describe('the pre-paint script', () => {
	const source = readFileSync(new URL('../static/theme.js', import.meta.url), 'utf8');

	/*
	 * static/theme.js runs before anything is loaded and so cannot import the
	 * key it reads. This is the same trick the credit uses for the version: the
	 * second spelling is read back off disk rather than trusted.
	 */
	it('reads the same key the app writes', () => {
		expect(source).toContain(`'${KEYS.theme}'`);
	});

	it('resolves to a colour rather than to `system`', () => {
		// The stylesheet keys off [data-theme='dark'] and a bare :root. Handing
		// it `system` would leave it resolving a preference of its own.
		expect(source).toContain('dataset.theme');
		expect(source).not.toContain("'system'");
	});
});
