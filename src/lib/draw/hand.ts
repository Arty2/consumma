import { rng } from './rng.ts';

/**
 * Every mark in the app is one of these. There are no image files, no icon
 * fonts, and no CSS borders on anything drawn — a CSS border cannot wobble.
 */

export type Pt = {
	x: number;
	y: number;
	/**
	 * Bend the segment arriving here through this point instead of through a
	 * nudged midpoint. A corner being rounded is the only thing that sets it:
	 * curving towards the vertex is what makes an arc rather than a chamfer.
	 */
	via?: Pt;
};

export type HandOptions = {
	seed: number;
	/** Peak deviation of a control point from the true line, in user units. */
	wobble?: number;
};

const round = (n: number) => Math.round(n * 100) / 100;

/**
 * Turns a list of points into a wobbly path.
 *
 * Each segment becomes a quadratic curve whose control point sits at the
 * midpoint, nudged perpendicular to the segment by a seeded amount. Nudging
 * perpendicular rather than in both axes is what makes it read as an unsteady
 * hand rather than as noise.
 */
export function handPath(points: readonly Pt[], options: HandOptions): string {
	if (points.length < 2) return '';

	const wobble = options.wobble ?? 1;
	const random = rng(options.seed);

	let d = `M ${round(points[0].x)} ${round(points[0].y)}`;

	for (let i = 1; i < points.length; i++) {
		const from = points[i - 1];
		const to = points[i];

		// A corner names the point to bend through; a straight run works one out.
		if (to.via) {
			d += ` Q ${round(to.via.x)} ${round(to.via.y)} ${round(to.x)} ${round(to.y)}`;
			continue;
		}

		const dx = to.x - from.x;
		const dy = to.y - from.y;
		const len = Math.hypot(dx, dy) || 1;

		// Unit normal to the segment.
		const nx = -dy / len;
		const ny = dx / len;
		const offset = (random() * 2 - 1) * wobble;

		const cx = (from.x + to.x) / 2 + nx * offset;
		const cy = (from.y + to.y) / 2 + ny * offset;

		d += ` Q ${round(cx)} ${round(cy)} ${round(to.x)} ${round(to.y)}`;
	}

	return d;
}

/**
 * Splits long runs into shorter ones.
 *
 * handPath nudges one control point per segment, so however long a segment is,
 * it bends exactly once. A 900px side drawn in one go is a single gentle bow —
 * which is to say a ruled line; the wobble has to recur along a stroke to read
 * as a hand. Short sides are left alone: a 22px checkbox needs no help, and
 * subdividing it would re-cut every box already drawn.
 */
function subdivide(points: readonly Pt[], every: number): Pt[] {
	const out: Pt[] = [points[0]];

	for (let i = 1; i < points.length; i++) {
		const from = points[i - 1];
		const to = points[i];
		const steps = Math.max(1, Math.round(Math.hypot(to.x - from.x, to.y - from.y) / every));

		for (let step = 1; step <= steps; step++) {
			// The last one is the original point, so a corner keeps its `via`.
			if (step === steps) {
				out.push(to);
				break;
			}

			out.push({
				x: from.x + ((to.x - from.x) * step) / steps,
				y: from.y + ((to.y - from.y) * step) / steps
			});
		}
	}

	return out;
}

/** A point `distance` along the way from `from` towards `towards`. */
function along(from: Pt, towards: Pt, distance: number): Pt {
	const dx = towards.x - from.x;
	const dy = towards.y - from.y;
	const len = Math.hypot(dx, dy) || 1;
	// Never past halfway, or two cuts on a short side would cross each other.
	const t = Math.min(distance, len / 2) / len;

	return { x: from.x + dx * t, y: from.y + dy * t };
}

/**
 * Cuts every corner of a closed polygon back along both its edges.
 *
 * The short chord left across each corner is what rounds it: handPath curves
 * it, and `stroke-linejoin: round` closes what is left. At three pixels that
 * reads as a pen turning rather than as a chamfer.
 */
function roundCorners(corners: readonly Pt[], radius: number): Pt[] {
	const out: Pt[] = [];
	const n = corners.length;

	for (let i = 0; i < n; i++) {
		const here = corners[i];
		out.push(along(here, corners[(i - 1 + n) % n], radius));
		// The turn bends through the corner it just cut off.
		out.push({ ...along(here, corners[(i + 1) % n], radius), via: here });
	}

	return out;
}

/**
 * A rectangle drawn as one continuous stroke whose corners overshoot slightly,
 * the way a pen does when it does not stop exactly where it started.
 *
 * Long sides wobble along their length rather than bowing once, so a tall
 * panel's edge does not come out ruled.
 *
 * With a `radius` the corners are cut and the stroke closes on itself instead
 * of crossing — a box small enough to sit around a word has no room for an
 * overshoot, which at that size reads as a mistake rather than as a hand.
 */
export function handRect(
	width: number,
	height: number,
	options: HandOptions & { inset?: number; overshoot?: number; every?: number; radius?: number }
): string {
	const i = options.inset ?? 1;
	const over = options.overshoot ?? 2.5;
	const every = options.every ?? 90;
	const radius = options.radius ?? 0;
	const random = rng(options.seed ^ 0x9e3779b9);
	const jitter = () => (random() * 2 - 1) * over;

	const left = i;
	const top = i;
	const right = width - i;
	const bottom = height - i;

	if (radius > 0) {
		const corners = [
			{ x: left, y: top + jitter() * 0.3 },
			{ x: right + jitter() * 0.2, y: top },
			{ x: right, y: bottom + jitter() * 0.3 },
			{ x: left + jitter() * 0.2, y: bottom }
		];
		const rounded = roundCorners(corners, radius);

		// Back to where the pen started, rather than past it.
		return handPath(subdivide([...rounded, rounded[0]], every), options);
	}

	return handPath(
		subdivide(
			[
				{ x: left + over, y: top },
				{ x: right, y: top + jitter() },
				{ x: right + jitter() * 0.3, y: bottom },
				{ x: left, y: bottom + jitter() * 0.3 },
				// Past the start, so the corner closes with a crossing rather than a
				// join.
				{ x: left + jitter() * 0.3, y: top - over * 0.4 }
			],
			every
		),
		options
	);
}

/** The rule under a group title. */
export function handLine(width: number, options: HandOptions & { y?: number }): string {
	const y = options.y ?? 1;

	return handPath(
		[
			{ x: 0, y },
			{ x: width * 0.4, y },
			{ x: width * 0.75, y },
			{ x: width, y }
		],
		options
	);
}

/**
 * A paper tear, not a saw blade: irregular tooth widths and depths, stroked
 * across the full width.
 *
 * Drawn at the width it will be shown at — see TornEdge.svelte. Generating it
 * once and stretching it is what made the line weight uneven, because a stroke
 * under an anisotropic transform is thinner along the compressed axis.
 */
export function handTear(
	width: number,
	height: number,
	options: HandOptions & { teeth?: number }
): string {
	const teeth = options.teeth ?? 22;
	const random = rng(options.seed ^ 0x85ebca6b);
	const mid = height / 2;

	const points: Pt[] = [{ x: 0, y: mid }];
	let x = 0;
	let up = true;

	while (x < width) {
		// Tooth widths vary by half either way, so no two are alike.
		x += (width / teeth) * (0.45 + random() * 1.3);

		/*
		 * Three things stop this reading as a saw blade.
		 *
		 * A third of the teeth are shallow, so the depths are not all the same.
		 * The side flips only most of the time, so the tear sometimes runs twice
		 * on one side of the line the way torn paper does. And the baseline
		 * drifts, so the whole thing does not sit on a ruler.
		 */
		const shallow = random() < 0.25;
		const depth = (shallow ? 0.3 + random() * 0.28 : 0.78 + random() * 0.22) * mid;
		const drift = (random() * 2 - 1) * mid * 0.12;

		points.push({ x: Math.min(x, width), y: mid + drift + (up ? -depth : depth) });
		if (random() > 0.12) up = !up;
	}

	/*
	 * End on a full-width tooth.
	 *
	 * The loop stops once it passes the right edge, so its last tooth is clamped
	 * to `width` and can end up a sliver away from the one before it. Either
	 * that, or a midline point appended after a tooth already at the edge,
	 * leaves a short near-vertical hook that reads as a mistake rather than as
	 * paper. So: pull the final tooth out to the edge, then drop the one before
	 * it if the run between them is too short to be a tooth.
	 */
	const minimum = width / teeth / 4;
	points[points.length - 1].x = width;

	while (points.length > 2 && points[points.length - 1].x - points[points.length - 2].x < minimum) {
		points.splice(points.length - 2, 1);
	}

	return handPath(points, { ...options, wobble: options.wobble ?? 0.9 });
}

/** The tri-state checkbox glyphs: nothing, one diagonal, two crossed. */
export function handCheck(size: number, options: HandOptions): string {
	const random = rng(options.seed ^ 0xc2b2ae35);
	const pad = size * 0.22;
	const jitter = () => (random() * 2 - 1) * size * 0.06;

	return handPath(
		[
			{ x: pad + jitter(), y: size - pad + jitter() },
			{ x: size - pad + jitter(), y: pad + jitter() }
		],
		options
	);
}

export function handCheckBack(size: number, options: HandOptions): string {
	const random = rng(options.seed ^ 0x27d4eb2f);
	const pad = size * 0.22;
	const jitter = () => (random() * 2 - 1) * size * 0.06;

	return handPath(
		[
			{ x: pad + jitter(), y: pad + jitter() },
			{ x: size - pad + jitter(), y: size - pad + jitter() }
		],
		options
	);
}

/** The ✕ that removes a task, and the one that closes a modal. */
export function handCross(size: number, options: HandOptions): string {
	return `${handCheck(size, options)} ${handCheckBack(size, options)}`;
}

/** The chevron on a group title. */
export function handChevron(size: number, collapsed: boolean, options: HandOptions): string {
	const w = size * 0.62;
	const h = size * 0.3;
	const x = (size - w) / 2;
	const y = (size - h) / 2;

	return handPath(
		collapsed
			? [
					{ x, y },
					{ x: x + w / 2, y: y + h },
					{ x: x + w, y }
				]
			: [
					{ x, y: y + h },
					{ x: x + w / 2, y },
					{ x: x + w, y: y + h }
				],
		options
	);
}

/**
 * The burger that opens the menu: three strokes, each seeded apart so they
 * wobble independently rather than reading as one shape stamped three times.
 *
 * The bars are unequal by a few percent, the way three pen strokes are.
 */
export function handBurger(size: number, options: HandOptions): string {
	const widths = [1, 0.88, 0.96];
	const gap = size * 0.3;
	const top = (size - gap * 2) / 2;

	return widths
		.map((factor, i) => {
			const w = size * factor;
			const x = (size - w) / 2;
			const y = top + gap * i;

			return handPath(
				[
					{ x, y },
					{ x: x + w * 0.45, y },
					{ x: x + w, y }
				],
				{ ...options, seed: options.seed + i * 977 }
			);
		})
		.join(' ');
}

/**
 * The same button when something is waiting to go: an arrow up and to the
 * right. Not a status light — it is the outbox, pointing the way out.
 */
export function handArrow(size: number, options: HandOptions): string {
	const pad = size * 0.22;
	const from = { x: pad, y: size - pad };
	const to = { x: size - pad, y: pad };
	const head = size * 0.34;

	const shaft = handPath([from, { x: (from.x + to.x) / 2, y: (from.y + to.y) / 2 }, to], options);

	// Two strokes off the point, drawn as one polyline so the corner joins.
	const barb = handPath([{ x: to.x - head, y: to.y }, to, { x: to.x, y: to.y + head }], {
		...options,
		seed: options.seed + 613
	});

	return `${shaft} ${barb}`;
}

/**
 * A circle with a stroke through it: the list could not be reached.
 *
 * Not a warning triangle and not a crossed-out cloud — being offline is a
 * condition, not an error, and the same three glyphs have to read as one hand.
 * Closed, unlike handRefresh, so the two are never confused at 22px: one is a
 * stroke that came back round, this one is shut.
 *
 * The slash is seeded apart from the ring, so it does not inherit the same
 * wobble and come out looking stamped rather than drawn.
 */
export function handSlashedCircle(size: number, options: HandOptions): string {
	const r = size * 0.34;
	const c = size / 2;

	const points: Pt[] = [];
	const steps = 12;
	for (let i = 0; i <= steps; i++) {
		const a = (Math.PI * 2 * i) / steps;
		points.push({ x: c + Math.cos(a) * r, y: c + Math.sin(a) * r });
	}

	const ring = handPath(points, options);

	// Corner to corner through the middle, running past the ring at both ends
	// the way a pen does when it strikes something out.
	const reach = r * 1.24;
	const slash = handPath(
		[
			{ x: c - reach * 0.7, y: c + reach * 0.7 },
			{ x: c, y: c },
			{ x: c + reach * 0.7, y: c - reach * 0.7 }
		],
		{ ...options, seed: options.seed + 419 }
	);

	return `${ring} ${slash}`;
}

/**
 * The side of the sheet: a drawn line down its whole length.
 *
 * The torn edges close the paper top and bottom; without these it has no
 * sides, and reads as text on a page rather than as a strip of paper. Drawn at
 * the height it is shown at, like the tear — see TornEdge.svelte — so the
 * weight matches and nothing is stretched.
 */
export function handVertical(
	height: number,
	options: HandOptions & { x?: number; every?: number }
): string {
	const x = options.x ?? 1;
	// Defaults to the spacing handRect subdivides at, so long strokes wobble at
	// the same rate unless a caller wants a busier hand.
	const steps = Math.max(2, Math.round(height / (options.every ?? 90)));

	const points: Pt[] = [];
	for (let i = 0; i <= steps; i++) points.push({ x, y: (height * i) / steps });

	return handPath(points, options);
}

/**
 * A circular arrow: sync when nothing is waiting but the list has not been
 * looked at in a while.
 *
 * Open at the top, so it reads as a stroke someone came back round rather than
 * a closed ring, and it can never be mistaken for the status square.
 */
export function handRefresh(size: number, options: HandOptions): string {
	const r = size * 0.34;
	const c = size / 2;
	// Most of the way round, leaving a gap the arrowhead sits in.
	const from = -Math.PI * 0.35;
	const to = Math.PI * 1.5;

	const points: Pt[] = [];
	const steps = 10;
	for (let i = 0; i <= steps; i++) {
		const a = from + ((to - from) * i) / steps;
		points.push({ x: c + Math.cos(a) * r, y: c + Math.sin(a) * r });
	}

	const ring = handPath(points, options);

	// The head sits on the open end, pointing the way the stroke was travelling.
	const tip = points[0];
	const head = size * 0.2;
	const barb = handPath(
		[{ x: tip.x - head, y: tip.y - head * 0.35 }, tip, { x: tip.x - head * 0.15, y: tip.y + head }],
		{ ...options, seed: options.seed + 271 }
	);

	return `${ring} ${barb}`;
}
