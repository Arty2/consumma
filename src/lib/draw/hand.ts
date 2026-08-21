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

/**
 * Points along a circular arc, `from` to `to` in radians, sampled evenly.
 *
 * Twelve steps everywhere: handPath bends each segment once, so the sampling
 * rate is what decides how often a ring wobbles, and two rings sampled at
 * different rates do not read as the same hand.
 */
function arc(c: number, r: number, from: number, to: number, steps = 12): Pt[] {
	const points: Pt[] = [];

	for (let i = 0; i <= steps; i++) {
		const a = from + ((to - from) * i) / steps;
		points.push({ x: c + Math.cos(a) * r, y: c + Math.sin(a) * r });
	}

	return points;
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

/**
 * The rule under a group title.
 *
 * handPath bends each segment once, so a fixed number of points means a long
 * rule bends the same three times a short one does — and a 300px rule with
 * three gentle bows in it is a ruled line. The number of bends grows with the
 * width instead, and where they fall is seeded rather than even, because a
 * hand does not stop at regular intervals.
 */
export function handLine(
	width: number,
	options: HandOptions & { y?: number; every?: number }
): string {
	const y = options.y ?? 1;
	// Finer than the 90 handRect subdivides at: this is a stroke under a word,
	// not the side of a panel.
	const every = options.every ?? 34;
	const steps = Math.max(3, Math.round(width / every));
	const random = rng(options.seed ^ 0x7f4a7c15);

	const points: Pt[] = [{ x: 0, y }];

	for (let i = 1; i < steps; i++) {
		// Never enough to overtake its neighbour: a third of a step either way
		// leaves every point ahead of the one before it.
		const at = (i + (random() * 2 - 1) * 0.35) / steps;
		points.push({ x: width * at, y });
	}

	points.push({ x: width, y });

	return handPath(points, options);
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

/** The ✕ that closes a modal — putting something away, not taking it away. */
export function handCross(size: number, options: HandOptions): string {
	return `${handCheck(size, options)} ${handCheckBack(size, options)}`;
}

/**
 * The mark that removes a task, and the one that removes a group: something
 * scribbled out.
 *
 * It was a ✕ — the same two strokes the checkbox uses for done, at half the
 * size and a few millimetres away from them. Two marks made of the same
 * gesture, one meaning finished and one meaning gone, is a distinction the eye
 * has to be told about rather than one it can see. Crossing a thing out is
 * what a hand does to a line on paper it wants rid of, and nothing else on the
 * sheet is drawn that way.
 *
 * One stroke, never lifted: a scribble is the pen going back and forth without
 * leaving the paper, and drawing it as separate passes would make it hatching,
 * which is shading rather than deletion. So the points run right, left, right
 * across the box, dropping a little each time, and handPath bends every leg —
 * the turns at the ends come out round because a pen reversing has to.
 *
 * The ends fall short of the corners rather than reaching them, and the whole
 * figure keeps handCheck's own padding, so it occupies the box the ✕ occupied
 * and every place one stood still fits it.
 */
export function handScribble(size: number, options: HandOptions): string {
	const random = rng(options.seed ^ 0x165667b1);
	const pad = size * 0.18;
	const span = size - pad * 2;

	/*
	 * Four legs, which is the fewest that reads as a scribble rather than as a
	 * zigzag: three would be a `Z` and five in eleven pixels is a smudge.
	 */
	const legs = 4;
	const drop = span / legs;
	const jitter = (much: number) => (random() * 2 - 1) * size * much;
	/** Always inwards, so a turn never lands outside the box it is drawn in. */
	const pull = () => random() * size * 0.1;

	const points: Pt[] = [];
	for (let i = 0; i <= legs; i++) {
		/*
		 * Alternating ends, and each one pulled in by a different amount, so the
		 * turns do not stack up into a straight edge down either side — which is
		 * what makes a machine's zigzag look like one.
		 */
		const atRight = i % 2 === 1;
		const x = atRight ? pad + span - pull() : pad + pull();
		points.push({ x, y: pad + drop * i + jitter(0.05) });
	}

	return handPath(points, { ...options, wobble: options.wobble ?? 0.9 });
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
 * An arrow pointing back the way you came, level rather than on the diagonal.
 *
 * The panel's own corner mark. It is not `handArrow` turned: that one runs up
 * and out and means an outbox, and the same drawing laid on its side would be
 * a mark saying something it was not drawn to say. Level and leftwards is its
 * own stroke, and what it means is where the tap goes.
 */
export function handBack(size: number, options: HandOptions): string {
	const pad = size * 0.2;
	const middle = size / 2;
	const from = { x: size - pad, y: middle };
	const to = { x: pad, y: middle };
	const head = size * 0.28;

	const shaft = handPath([from, { x: (from.x + to.x) / 2, y: middle }, to], options);

	// Both barbs in one polyline, so the corner at the point joins as a corner.
	const barb = handPath(
		[{ x: to.x + head, y: middle - head }, to, { x: to.x + head, y: middle + head }],
		{
			...options,
			seed: options.seed + 421
		}
	);

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

	const ring = handPath(arc(c, r, 0, Math.PI * 2), options);

	/*
	 * One stroke, corner to corner through the middle, ending well clear of the
	 * ring at both ends the way a pen does when it strikes something out.
	 *
	 * The reach is what makes it read as a crossing rather than a chord. At a
	 * quarter past the radius the ends cleared the ring by about the width of
	 * the stroke itself, which at 22px is not a crossing — it is a line that
	 * stops where the circle is.
	 *
	 * Two points rather than three: handPath bends each segment once, so a
	 * middle point put a kink at the centre of what should be one fast stroke.
	 * Half the wobble, for the same reason — this is the most deliberate mark
	 * in the app.
	 */
	const reach = r * 0.98;
	const slash = handPath(
		[
			{ x: c - reach, y: c + reach },
			{ x: c + reach, y: c - reach }
		],
		{ ...options, seed: options.seed + 419, wobble: (options.wobble ?? 1) * 0.5 }
	);

	return `${ring} ${slash}`;
}

/**
 * One square bracket: a stem with a serif at each end, drawn in a single
 * stroke the way a hand makes one.
 *
 * `side` is which bracket it is — the left one turns its serifs to the right,
 * and the right one mirrors that. Graphe has no brackets of its own, so where
 * one has to be drawn rather than typed, this is it.
 */
export function handBracket(
	width: number,
	height: number,
	side: 'left' | 'right',
	options: HandOptions
): string {
	const stem = side === 'left' ? 0 : width;
	const serif = side === 'left' ? width : 0;

	return handPath(
		[
			{ x: serif, y: 0 },
			{ x: stem, y: 0 },
			{ x: stem, y: height / 2 },
			{ x: stem, y: height },
			{ x: serif, y: height }
		],
		options
	);
}

/**
 * A handful of short strokes radiating from the middle: the one flourish a
 * checkbox gets when it is ticked.
 *
 * Unequal lengths and uneven angles, because six identical spokes is an asterisk
 * and this is meant to read as a scribble of delight. Nothing here is animated —
 * the strokes are drawn, and CSS fades and grows them.
 */
export function handSparkle(size: number, options: HandOptions & { rays?: number }): string {
	const rays = options.rays ?? 6;
	const c = size / 2;
	const random = rng(options.seed ^ 0x2545f491);

	return Array.from({ length: rays }, (_, i) => {
		// Off the even spoke by up to a third of a step, so no two gaps match.
		const angle = ((i + (random() * 2 - 1) * 0.33) / rays) * Math.PI * 2;
		const from = c * (0.42 + random() * 0.12);
		const to = c * (0.72 + random() * 0.26);

		return handPath(
			[
				{ x: c + Math.cos(angle) * from, y: c + Math.sin(angle) * from },
				{ x: c + Math.cos(angle) * to, y: c + Math.sin(angle) * to }
			],
			{ ...options, seed: options.seed + i * 733 }
		);
	}).join(' ');
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

	/*
	 * A wide gap, and the head built from the direction of travel.
	 *
	 * It used to close to within twenty-seven degrees and carry a barb made of
	 * fixed offsets that had nothing to do with where the stroke was going — so
	 * at 22px it read as a ring with a nick out of it and a tick inside. A
	 * quarter of the circle is open now, which is what says "came round" rather
	 * than "closed".
	 *
	 * The pen starts at the bottom right, sweeps three quarters the long way
	 * round, and finishes at the top right. That places the head where there is
	 * room for it: ending at the far right instead put a barb past the edge of
	 * the box.
	 */
	const start = -Math.PI * 1.75;
	const end = -Math.PI * 0.25;

	const points = arc(c, r, start, end);
	const ring = handPath(points, options);

	/*
	 * Two strokes off the end, opening back along the way the pen came. The
	 * tangent at that point is a quarter turn past the angle itself, because
	 * the stroke travels along the circle rather than out from its middle.
	 */
	const tip = points[points.length - 1];
	const tangent = end + Math.PI / 2;
	const head = size * 0.2;
	/*
	 * Wide, nearly across the end of the stroke rather than tucked back along
	 * it. A tight head is what an arrow has room for at a size you can see; at
	 * 22px the two barbs close up against the ring and the whole thing reads as
	 * a blob, where a flat one stays two strokes and a corner.
	 */
	const spread = Math.PI * 0.72;

	const barb = handPath(
		[
			{
				x: tip.x + Math.cos(tangent + spread) * head,
				y: tip.y + Math.sin(tangent + spread) * head
			},
			tip,
			{
				x: tip.x + Math.cos(tangent - spread) * head,
				y: tip.y + Math.sin(tangent - spread) * head
			}
		],
		{ ...options, seed: options.seed + 271 }
	);

	return `${ring} ${barb}`;
}

/**
 * A ring of short strokes struck outward from the middle: the light around a
 * sun, whichever body is standing in the middle of it.
 *
 * Unequal lengths and uneven angles, for the same reason handSparkle's are
 * unequal — eight even spokes is an asterisk, not a drawing of the sun.
 */
function corona(
	c: number,
	size: number,
	rays: number,
	inner: number,
	outer: number,
	options: HandOptions
): string {
	const random = rng(options.seed ^ 0x85ebca6b);

	return Array.from({ length: rays }, (_, i) => {
		// Off the even spoke by up to a third of a step, so no two gaps match.
		const angle = ((i + (random() * 2 - 1) * 0.3) / rays) * Math.PI * 2;
		/*
		 * Either side of the length asked for, rather than only ever longer.
		 * Jitter that adds is a margin the caller cannot see: it put the tip of
		 * the longest ray outside the box, which at 22px is a stroke clipped by
		 * the button rather than a hand that wavered.
		 */
		const from = size * inner * (0.96 + random() * 0.08);
		const to = size * outer * (0.94 + random() * 0.12);

		return handPath(
			[
				{ x: c + Math.cos(angle) * from, y: c + Math.sin(angle) * from },
				{ x: c + Math.cos(angle) * to, y: c + Math.sin(angle) * to }
			],
			{ ...options, seed: options.seed + i * 733 }
		);
	}).join(' ');
}

/**
 * The inner edge of a crescent: a bow between the two horns, curving back
 * across the disc.
 *
 * Sampled off the chord rather than struck as a second circle. A crescent is
 * properly two circles, one cutting the other, but the horns are then wherever
 * those two happen to meet — and at 22px the arc between them is three pixels
 * of a very large circle, which is to say a curve nobody can tell from this
 * one. This way the horns are given, so the limb and the edge begin and end in
 * the same two places by construction rather than by arithmetic.
 *
 * `waist` is how thick the crescent comes out across its middle, as a fraction
 * of the radius, and it is the whole glyph: too generous and this is a full
 * moon with a line drawn on it.
 */
function bow(c: number, r: number, facing: number, gap: number, waist: number, steps = 6): Pt[] {
	const from = { x: c + Math.cos(facing - gap) * r, y: c + Math.sin(facing - gap) * r };
	const to = { x: c + Math.cos(facing + gap) * r, y: c + Math.sin(facing + gap) * r };

	// Far enough past the chord that the apex lands `waist` short of the limb.
	const depth = Math.cos(gap) * r + r * (1 - waist);

	const points: Pt[] = [];
	for (let i = 0; i <= steps; i++) {
		const t = i / steps;
		const push = Math.sin(Math.PI * t) * depth;

		points.push({
			x: from.x + (to.x - from.x) * t - Math.cos(facing) * push,
			y: from.y + (to.y - from.y) * t - Math.sin(facing) * push
		});
	}

	return points;
}

/**
 * A crescent in two strokes, seeded apart, so the horns close by hand rather
 * than by arithmetic — the limb and the edge are drawn to the same two points,
 * and what is left between them is the join a pen makes.
 */
function crescent(
	c: number,
	r: number,
	facing: number,
	gap: number,
	waist: number,
	options: HandOptions
): string {
	// The long way round: what is left open is the gap between the horns.
	const limb = handPath(arc(c, r, facing + gap, facing + Math.PI * 2 - gap), options);
	const edge = handPath(bow(c, r, facing, gap, waist), {
		...options,
		seed: options.seed + 337
	});

	return `${limb} ${edge}`;
}

/**
 * Up and to the right, for both bodies that have a side to face.
 *
 * This is not any particular night's moon. It faces that way because the horns
 * then sit clear of the corners of a square box, and the thick of it falls
 * down the left where there is room for it.
 */
const FACING = -Math.PI * 0.25;

/**
 * The one crescent both marks are cut from, drawn at two sizes.
 *
 * A generous waist and a narrow gap: a moon this app draws is a moon a few
 * nights off full, not a fingernail. Thinner, it came out as a stroke with a
 * bend in it — and the sliver that was left in the smaller of the two closed
 * up altogether once the corona was around it.
 */
const GAP = Math.PI * 0.26;
const WAIST = 0.68;

/** The theme is light: a sun, disc and all. */
export function handSun(size: number, options: HandOptions & { rays?: number }): string {
	const c = size / 2;

	/*
	 * A small disc for the box it sits in, because the light has to fit outside
	 * it. Drawn at the radius the other 22px glyphs use, a sun leaves its rays
	 * either past the edge of the button or lying on top of itself.
	 */
	const disc = handPath(arc(c, size * 0.19, 0, Math.PI * 2), options);

	return `${disc} ${corona(c, size, options.rays ?? 8, 0.29, 0.42, options)}`;
}

/** The theme is dark: a moon, and nothing else in the sky. */
export function handMoon(size: number, options: HandOptions): string {
	return crescent(size / 2, size * 0.32, FACING, GAP, WAIST, options);
}

/**
 * Both bodies at once: the theme is whatever the phone is doing.
 *
 * The moon standing in the sun's light — a crescent where the sun keeps its
 * disc, inside a corona the moon does not have. That is what makes three
 * glyphs out of two bodies: each of the others is this one with a piece taken
 * away, and none of the three is the crossed circle the sync button draws when
 * the list cannot be reached.
 *
 * The crescent is thinner and the corona sparser than either mark alone. This
 * one is carrying two things in the space the others carry one, and a full
 * eight rays around a crescent closes the gaps that say it is a crescent.
 */
export function handSunMoon(size: number, options: HandOptions): string {
	const c = size / 2;
	/*
	 * A smaller moon than handMoon draws, and the corona struck further out
	 * than the sun's, so there is a clear band of paper between the two. Sat
	 * closer they touched at 22px and the rays read as spines on the moon
	 * rather than as light behind it.
	 *
	 * The rays are shorter for it. That is the right thing to spend: their
	 * length says nothing, and the gap says these are two bodies.
	 */
	const moon = crescent(c, size * 0.23, FACING, GAP, WAIST, options);

	return `${moon} ${corona(c, size, 6, 0.37, 0.46, options)}`;
}

/**
 * The mark under a link, as a tile that repeats along a line of text.
 *
 * Every other drawn thing here is an inline `<svg>` measured to the box it
 * belongs to. A link cannot be: it is inline text, it wraps, and each of its
 * line boxes wants its own underline — which is precisely what a repeating
 * background does for free and what a single measured element cannot do at
 * all without re-measuring every line on every reflow.
 *
 * So this one returns a whole SVG document rather than a path, ready to be a
 * `url()`. It is still drawn by the same hand as the rest: one `handLine`,
 * seeded, wobbling on the same terms.
 *
 * The colour is baked because a data URI is its own document and cannot read
 * `--ink`. That is why this takes one — see app.css, where it is called once
 * for each of the two colours the sheet is ever drawn in.
 */
export function handUnderlineTile(
	width: number,
	height: number,
	ink: string,
	options: HandOptions
): string {
	// Two-thirds down the tile, so the stroke has room to wobble under the
	// baseline without being clipped by the edge of its own box.
	const d = handLine(width, { ...options, y: height * 0.55, every: 9 });

	const svg =
		`<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}" ` +
		`viewBox="0 0 ${width} ${height}">` +
		`<path d="${d}" fill="none" stroke="${ink}" stroke-width="1.4" ` +
		`stroke-linecap="round"/></svg>`;

	return svg;
}
