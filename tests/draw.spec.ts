import { describe, expect, it } from 'vitest';
import {
	handArrow,
	handBurger,
	handCheck,
	handLine,
	handPath,
	handRect,
	handRefresh,
	handTear,
	handVertical
} from '../src/lib/draw/hand';
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

	it('breaks a long side up so it wobbles along its length', () => {
		// handPath bends a segment exactly once, so a tall panel's side drawn in
		// one go is a single gentle bow — a ruled line with extra steps.
		const tall = endpoints(handRect(380, 900, { seed: 9, wobble: 2 }));
		const gaps = tall.slice(1).map((p, i) => Math.hypot(p.x - tall[i].x, p.y - tall[i].y));

		expect(Math.max(...gaps)).toBeLessThan(140);
	});

	it('leaves a small box alone, so no checkbox already drawn changes', () => {
		// A 22px box needs no help, and subdividing it would re-cut every one.
		const points = endpoints(handRect(22, 22, { seed: 9, wobble: 1 }));

		expect(points).toHaveLength(5);
	});

	it('keeps a long side inside its box, so the frame is not clipped', () => {
		const points = endpoints(handRect(380, 900, { seed: 4, wobble: 2, overshoot: 2.5 }));

		for (const { x, y } of points) {
			expect(x).toBeGreaterThanOrEqual(-4);
			expect(x).toBeLessThanOrEqual(384);
			expect(y).toBeGreaterThanOrEqual(-4);
			expect(y).toBeLessThanOrEqual(904);
		}
	});
});

describe('handBurger', () => {
	const SIZE = 22;

	it('is three separate strokes, not one shape', () => {
		const d = handBurger(SIZE, { seed: seedFrom('menu') });

		expect(d.match(/M /g)).toHaveLength(3);
	});

	it('keeps every bar inside the box it is drawn in', () => {
		for (const seed of [1, 7, 99, 1234]) {
			for (const { x, y } of endpoints(handBurger(SIZE, { seed, wobble: 1 }))) {
				expect(x, `seed ${seed}`).toBeGreaterThanOrEqual(0);
				expect(x, `seed ${seed}`).toBeLessThanOrEqual(SIZE);
				expect(y, `seed ${seed}`).toBeGreaterThanOrEqual(0);
				expect(y, `seed ${seed}`).toBeLessThanOrEqual(SIZE);
			}
		}
	});

	it('stacks the bars in three distinct rows', () => {
		const rows = [...new Set(endpoints(handBurger(SIZE, { seed: 3 })).map((p) => p.y))];

		expect(rows).toHaveLength(3);
		// Evenly spaced, and in order down the box.
		const [a, b, c] = [...rows].sort((m, n) => m - n);
		expect(b - a).toBeCloseTo(c - b, 5);
	});

	it('wobbles each bar independently rather than repeating one', () => {
		// Three identical strokes would mean the seed was not varied per bar.
		const [first, second, third] = handBurger(SIZE, { seed: 5, wobble: 1.4 })
			.split('M ')
			.filter(Boolean);

		expect(second).not.toBe(first);
		expect(third).not.toBe(first);
	});

	it('is stable for a seed, so it never re-jitters on a render', () => {
		expect(handBurger(SIZE, { seed: 8 })).toBe(handBurger(SIZE, { seed: 8 }));
	});
});

describe('handArrow', () => {
	const SIZE = 22;

	it('points up and to the right', () => {
		const points = endpoints(handArrow(SIZE, { seed: 2, wobble: 0 }));
		const [start] = points;
		// The shaft runs from bottom-left to top-right before the barb starts.
		const tip = points[2];

		expect(tip.x).toBeGreaterThan(start.x);
		expect(tip.y).toBeLessThan(start.y);
	});

	it('has a head that meets the point of the shaft', () => {
		const points = endpoints(handArrow(SIZE, { seed: 2, wobble: 0 }));
		const tip = points[2];
		// The barb is drawn through the same point the shaft ends at.
		expect(points.some((p, i) => i > 2 && p.x === tip.x && p.y === tip.y)).toBe(true);
	});

	it('stays inside its box, so the button never clips it', () => {
		for (const seed of [1, 7, 99, 1234]) {
			for (const { x, y } of endpoints(handArrow(SIZE, { seed, wobble: 1 }))) {
				expect(x, `seed ${seed}`).toBeGreaterThanOrEqual(0);
				expect(x, `seed ${seed}`).toBeLessThanOrEqual(SIZE);
				expect(y, `seed ${seed}`).toBeGreaterThanOrEqual(0);
				expect(y, `seed ${seed}`).toBeLessThanOrEqual(SIZE);
			}
		}
	});

	it('is stable for a seed', () => {
		expect(handArrow(SIZE, { seed: 4 })).toBe(handArrow(SIZE, { seed: 4 }));
	});

	it('is not the burger', () => {
		expect(handArrow(SIZE, { seed: 4 })).not.toBe(handBurger(SIZE, { seed: 4 }));
	});
});

describe('handVertical', () => {
	it('runs the full height it is given', () => {
		const points = endpoints(handVertical(600, { seed: 3, wobble: 1 }));
		const ys = points.map((p) => p.y);

		expect(Math.min(...ys)).toBe(0);
		expect(Math.max(...ys)).toBe(600);
	});

	it('wobbles along its length rather than bowing once', () => {
		// One segment would bend exactly once, which is a ruled line.
		const points = endpoints(handVertical(600, { seed: 3, wobble: 1 }));
		const gaps = points.slice(1).map((p, i) => p.y - points[i].y);

		expect(Math.max(...gaps)).toBeLessThan(140);
	});

	it('stays on its own side, so it never crosses the sheet', () => {
		for (const seed of [1, 7, 99]) {
			for (const { x } of endpoints(handVertical(900, { seed, wobble: 1.2, x: 2.5 }))) {
				expect(x, `seed ${seed}`).toBe(2.5);
			}
		}
	});

	it('is stable for a seed', () => {
		expect(handVertical(400, { seed: 6 })).toBe(handVertical(400, { seed: 6 }));
	});
});

describe('handRefresh', () => {
	const SIZE = 22;

	it('comes back round on itself without closing', () => {
		const points = endpoints(handRefresh(SIZE, { seed: 3, wobble: 0 }));
		const centre = { x: SIZE / 2, y: SIZE / 2 };
		const ring = points.slice(0, 11);

		// Every point of the ring sits at the same distance from the middle.
		const radii = ring.map((p) => Math.hypot(p.x - centre.x, p.y - centre.y));
		expect(Math.max(...radii) - Math.min(...radii)).toBeLessThan(0.01);

		// And the ends do not meet, or it would be a circle with a spike.
		const gap = Math.hypot(ring[0].x - ring.at(-1)!.x, ring[0].y - ring.at(-1)!.y);
		expect(gap).toBeGreaterThan(1);
	});

	it('stays inside its box at any seed', () => {
		for (const seed of [1, 7, 99, 1234]) {
			for (const { x, y } of endpoints(handRefresh(SIZE, { seed, wobble: 1 }))) {
				expect(x, `seed ${seed}`).toBeGreaterThanOrEqual(0);
				expect(x, `seed ${seed}`).toBeLessThanOrEqual(SIZE);
				expect(y, `seed ${seed}`).toBeGreaterThanOrEqual(0);
				expect(y, `seed ${seed}`).toBeLessThanOrEqual(SIZE);
			}
		}
	});

	it('is stable for a seed, and is not the arrow', () => {
		expect(handRefresh(SIZE, { seed: 4 })).toBe(handRefresh(SIZE, { seed: 4 }));
		expect(handRefresh(SIZE, { seed: 4 })).not.toBe(handArrow(SIZE, { seed: 4 }));
	});
});
