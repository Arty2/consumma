import { rng } from './rng.ts';

/**
 * Every mark in the app is one of these. There are no image files, no icon
 * fonts, and no CSS borders on anything drawn — a CSS border cannot wobble.
 */

export type Pt = { x: number; y: number };

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
 * A rectangle drawn as one continuous stroke whose corners overshoot slightly,
 * the way a pen does when it does not stop exactly where it started.
 */
export function handRect(
	width: number,
	height: number,
	options: HandOptions & { inset?: number; overshoot?: number }
): string {
	const i = options.inset ?? 1;
	const over = options.overshoot ?? 2.5;
	const random = rng(options.seed ^ 0x9e3779b9);
	const jitter = () => (random() * 2 - 1) * over;

	const left = i;
	const top = i;
	const right = width - i;
	const bottom = height - i;

	return handPath(
		[
			{ x: left + over, y: top },
			{ x: right, y: top + jitter() },
			{ x: right + jitter() * 0.3, y: bottom },
			{ x: left, y: bottom + jitter() * 0.3 },
			// Past the start, so the corner closes with a crossing rather than a
			// join.
			{ x: left + jitter() * 0.3, y: top - over * 0.4 }
		],
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
