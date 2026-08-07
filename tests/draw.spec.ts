import { describe, expect, it } from 'vitest';
import { handCheck, handLine, handPath, handRect, handTear } from '../src/lib/draw/hand';
import { rng, seedFrom } from '../src/lib/draw/rng';

/**
 * The endpoints a path actually passes through. A `Q` carries a control point
 * before its endpoint, so a naive number scrape reads the control points and
 * misses where the pen lands.
 */
function endpoints(d: string): { x: number; y: number }[] {
	const tokens = d.trim().split(/\s+/);
	const points: { x: number; y: number }[] = [];

	let i = 0;
	while (i < tokens.length) {
		const command = tokens[i++];
		if (command === 'M') {
			points.push({ x: Number(tokens[i++]), y: Number(tokens[i++]) });
		} else if (command === 'Q') {
			i += 2; // the control point
			points.push({ x: Number(tokens[i++]), y: Number(tokens[i++]) });
		} else {
			throw new Error(`unexpected path command: ${command}`);
		}
	}

	return points;
}

describe('rng', () => {
	it('is deterministic for a seed', () => {
		const a = rng(42);
		const b = rng(42);

		expect([a(), a(), a()]).toStrictEqual([b(), b(), b()]);
	});

	it('gives different sequences for different seeds', () => {
		expect(rng(1)()).not.toBe(rng(2)());
	});

	it('stays inside [0, 1)', () => {
		const next = rng(7);
		for (let i = 0; i < 1000; i++) {
			const value = next();
			expect(value).toBeGreaterThanOrEqual(0);
			expect(value).toBeLessThan(1);
		}
	});

	it('hashes a stable string to a stable seed', () => {
		expect(seedFrom('task-abc')).toBe(seedFrom('task-abc'));
		expect(seedFrom('task-abc')).not.toBe(seedFrom('task-abd'));
	});
});

describe('hand', () => {
	/*
	 * The point of seeding is that a line does not move when the component
	 * re-renders. If these ever stop being equal, every box on the sheet will
	 * twitch on each keystroke.
	 */
	it('draws the same path from the same seed every time', () => {
		const options = { seed: seedFrom('t1'), wobble: 2 };

		expect(handRect(200, 44, options)).toBe(handRect(200, 44, options));
		expect(handTear(1000, 16, options)).toBe(handTear(1000, 16, options));
		expect(handCheck(22, options)).toBe(handCheck(22, options));
		expect(handLine(120, options)).toBe(handLine(120, options));
	});

	it('draws a different path from a different seed', () => {
		const a = handRect(200, 44, { seed: seedFrom('t1'), wobble: 2 });
		const b = handRect(200, 44, { seed: seedFrom('t2'), wobble: 2 });

		expect(a).not.toBe(b);
	});

	it('produces a path of quadratic curves, never straight lines', () => {
		const d = handPath(
			[
				{ x: 0, y: 0 },
				{ x: 10, y: 0 },
				{ x: 10, y: 10 }
			],
			{ seed: 1, wobble: 1 }
		);

		expect(d.startsWith('M ')).toBe(true);
		expect(d.split('Q')).toHaveLength(3);
		expect(d).not.toContain('L');
	});

	it('refuses to draw with fewer than two points', () => {
		expect(handPath([], { seed: 1 })).toBe('');
		expect(handPath([{ x: 1, y: 1 }], { seed: 1 })).toBe('');
	});

	it('emits only finite numbers, so no path can be NaN', () => {
		const paths = [
			handRect(200, 44, { seed: 3, wobble: 2 }),
			handTear(800, 16, { seed: 3 }),
			handLine(120, { seed: 3 }),
			handCheck(22, { seed: 3 })
		];

		for (const d of paths) {
			expect(d).not.toMatch(/NaN|Infinity|undefined/);
		}
	});

	it('draws a tear that spans the full width', () => {
		const points = endpoints(handTear(1000, 16, { seed: 5 }));
		const xs = points.map((p) => p.x);

		expect(Math.min(...xs)).toBe(0);
		expect(Math.max(...xs)).toBe(1000);
		// It has to actually go up and down, not drift across.
		expect(Math.min(...points.map((p) => p.y))).toBeLessThan(8);
		expect(Math.max(...points.map((p) => p.y))).toBeGreaterThan(8);
	});

	it('never ends on a sliver, at any width or seed', () => {
		/*
		 * The loop stops once it passes the right edge, so without care its last
		 * tooth lands a sliver from the one before it and the tear finishes with
		 * a short near-vertical hook. A tooth can legitimately be 0.45 of the
		 * nominal width, so the bar is a quarter of one.
		 */
		for (const width of [200, 358, 544, 1000]) {
			for (const seed of [1, 5, 7, 11, 23, 99]) {
				const teeth = Math.max(8, Math.round(width / 16));
				const points = endpoints(handTear(width, 16, { seed, teeth }));
				const [last, previous] = [points.at(-1)!, points.at(-2)!];

				expect(last.x, `${width}/${seed}`).toBe(width);
				expect(last.x - previous.x, `${width}/${seed}`).toBeGreaterThan(width / teeth / 4);
			}
		}
	});

	it('tears with irregular teeth rather than a saw blade', () => {
		const points = endpoints(handTear(1000, 16, { seed: 11 }));
		const widths = points.slice(1).map((p, i) => p.x - points[i].x);
		const depths = points.slice(1, -1).map((p) => Math.abs(p.y - 8));

		// A saw blade has one width and one depth. A tear has neither.
		expect(new Set(widths.map((w) => Math.round(w))).size).toBeGreaterThan(6);
		expect(Math.max(...depths) - Math.min(...depths)).toBeGreaterThan(3);
	});

	it('tears deeply enough to read as torn paper', () => {
		/*
		 * §6 asks for roughly 12–16px of peak-to-trough variation. Making the
		 * teeth irregular is easy to overdo — the first attempt at the rule above
		 * flattened this to about 4px, which reads as a wavy line rather than a
		 * tear, and nothing failed.
		 */
		for (const seed of [1, 7, 11, 23, 99]) {
			const ys = endpoints(handTear(1000, 16, { seed })).map((p) => p.y);
			expect(Math.max(...ys) - Math.min(...ys)).toBeGreaterThan(11);
		}
	});

	it('overshoots the corner of a box, the way a pen does', () => {
		// The stroke starts past the corner and ends above the top edge, so the
		// corner closes with a crossing rather than a join.
		const points = endpoints(handRect(100, 40, { seed: 9, wobble: 0, overshoot: 3 }));

		expect(points[0].x).toBeGreaterThan(1);
		expect(points.at(-1)!.y).toBeLessThan(1);
	});
});
