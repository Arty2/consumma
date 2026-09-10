<script lang="ts">
	import { boil, boiling } from '$lib/draw/boil.svelte';
	import { handBin, handPath, handTear, handVertical } from '$lib/draw/hand';
	import { seedFrom } from '$lib/draw/rng';
	import { drag } from '$lib/dnd/drag.svelte';

	/**
	 * The paper's top-right corner, turned down while a group is in hand.
	 *
	 * It is only ever there during that one gesture, and it takes the room the
	 * sync mark and the burger leave: neither of those has anything to say to a
	 * group being carried, so they go, and what appears in their place is the
	 * one thing that has. A group let go on the fold is removed, tasks and all,
	 * with the same undo the header's own mark leaves.
	 *
	 * The fold itself is not animated. A corner is either turned down or it is
	 * not, and the two states are half a second apart under a finger that is
	 * already moving — a fold that grew would be a mark doing something a fold
	 * does not. The bin standing in it is the one thing here that moves, and
	 * only while a group is over it.
	 */

	/*
	 * The box the fold is drawn in, and the two numbers it has to agree with:
	 * TornEdge's own height, since the tear sits above the paper and its
	 * zigzag runs along the middle of that box, and SideEdge's width, whose
	 * stroke runs down the middle of its own. Both are stated in app.css as
	 * `--tear` and `--edge`, and both are written out in those components for
	 * the same reason they are written out here — a path is drawn in user
	 * units and cannot read a custom property.
	 *
	 * `.catch` below is the fold's own square. Move one and move the other.
	 */
	const SIZE = 84;
	const TEAR = 16;
	const EDGE = 9;
	/** The tear's midline, which is where the paper actually stops. */
	const TOP = TEAR / 2;
	/** Where the side's stroke runs, which is where the paper actually stops. */
	const RIGHT = SIZE - EDGE / 2;
	/**
	 * How far along each edge the fold reaches. Equal, so the corner comes over
	 * square, and about as much room as the two marks it stands in for took.
	 */
	const LEG = 60;

	/**
	 * The three corners of the flap.
	 *
	 * `A` and `C` are where the crease meets the torn top edge and the side, and
	 * `P` is the paper's own corner after it has come over — reflected across
	 * the crease, which for equal legs lands it on the opposite corner of the
	 * fold's square.
	 *
	 * What that reflection carries with it is the point of this: the torn top
	 * edge arrives running **down** from `A`, and the side edge arrives running
	 * **left** from `C`. A folded corner shows the two edges it was cut with, in
	 * the places the fold puts them — a plain triangle would be a corner
	 * guillotined off and laid back down.
	 */
	const A = { x: RIGHT - LEG, y: TOP };
	const C = { x: RIGHT, y: TOP + LEG };
	const P = { x: RIGHT - LEG, y: TOP + LEG };

	/**
	 * What is past the fold, which is not paper.
	 *
	 * The same trick the tear uses: close the shape along the outside and fill
	 * that side with paper, so the marks running into it are cut rather than
	 * drawn over. Here what is cut is the torn edge and the side edge, and they
	 * are cut *on the diagonal* — the closing segment runs from the far corner
	 * straight through both ends of the crease, so a tooth reaching past it ends
	 * on the fold rather than on a vertical a hand never drew.
	 *
	 * Closed well past the box, because the marks it cuts do not stop at the box
	 * either: the tear's teeth dip a full half-height below their midline and
	 * the side's stroke carries a round cap beyond its own end.
	 */
	const OVER = 24;
	const slope = (C.y - A.y) / (C.x - A.x);
	const far = { x: A.x - (A.y + OVER) / slope, y: -OVER };

	const ground = `M ${far.x} ${far.y} L ${SIZE + OVER} ${-OVER} L ${SIZE + OVER} ${C.y} L ${C.x} ${C.y} Z`;

	/**
	 * The back of the sheet, which is opaque.
	 *
	 * Filled after the ground and before anything is drawn on it, so the writing
	 * it has come down over is under paper rather than showing through, and so a
	 * tooth of the tear that reached past the crease near `A` is covered by the
	 * flap it now belongs to.
	 */
	const flap = `M ${A.x} ${A.y} L ${P.x} ${P.y} L ${C.x} ${C.y} Z`;

	const crease = handPath([A, C], { seed: seedFrom('cornerfold'), wobble: 1.1 });

	/** The torn top edge, come over: same tear, same height, on its side. */
	const torn = handTear(LEG, TEAR, {
		seed: seedFrom('foldtear'),
		teeth: Math.max(4, Math.round(LEG / 16))
	});

	/** And the side edge, come over: the same wobble SideEdge draws with. */
	const side = handVertical(LEG, { seed: seedFrom('foldside'), wobble: 2.2, every: 55, x: 0 });

	/*
	 * A bin, and not the scribble every other delete in the app is drawn with.
	 *
	 * The scribble is a mark made *on* a thing — it belongs beside the row it
	 * strikes out, and on an empty corner it would be a mark with nothing under
	 * it. What the corner is, once the paper has come off it, is a place; and
	 * what a place to be rid of things looks like is a bin. It stands in the
	 * room the fold clears, which is not paper and so is the one part of this
	 * sheet nothing else can ever be written on.
	 *
	 * Full ink, always. It was drawn faint while it was only an offer, on the
	 * rule the add row's box follows — but that box is a suggestion of a thing
	 * that is not there yet, where this is a bin that is there whether or not
	 * anything is going into it. A faint one read as a control not yet
	 * available, which is the opposite of what the fold is saying.
	 *
	 * What says a group is over it is the mark boiling — the same hand redrawing
	 * the same bin four times over that the sync button works by, and the only
	 * thing on this sheet that means *this is live under your finger*. See
	 * src/lib/draw/boil.svelte.ts.
	 */
	const BIN = { w: 22, h: 26, x: 55, y: 8 };
	const bin = boil('foldbin', (o) => handBin(BIN.w, BIN.h, o));
	const boiled = boiling(() => drag.overFold);
</script>

<div class="fold" aria-hidden="true">
	<svg class="paint" viewBox="0 0 {SIZE} {SIZE}" width={SIZE} height={SIZE}>
		<path d={ground} class="ground" />
		<path d={flap} class="ground" />

		<!--
			The two edges the corner was cut with, where the fold has put them: the
			tear turned a quarter to run down from the crease's top end, and the
			side turned the other way to run in from its bottom one. Each is
			translated so the line it draws down the middle of its own box lands on
			the flap's edge rather than beside it.
		-->
		<g transform="translate({A.x} {A.y}) rotate(90) translate(0 {-TOP})">
			<path d={torn} class="drawn" />
		</g>
		<g transform="translate({P.x} {P.y}) rotate(-90)">
			<path d={side} class="drawn" />
		</g>

		<path d={crease} class="drawn" />

		<g transform="translate({BIN.x} {BIN.y})">
			<path d={bin[boiled.frame]} class="drawn" />
		</g>
	</svg>

	<!--
		The fold's own square, which is the flap and the room it has cleared —
		everything a finger would call the corner, and nothing beyond it. The top
		of the list is directly under it, so it stops where the fold stops: at the
		crease's own two ends, and not at the box the fold is drawn in.
	-->
	<div class="catch" data-fold></div>
</div>

<style>
	/*
	 * At the paper's corner, which is a tear's height above the top of the
	 * writing — the same offset `.sides` takes, since both have to reach the
	 * place the paper actually stops.
	 *
	 * Above the tear, which carries a `z-index` of its own so that it can cut
	 * the sides. A fold cuts the tear, so it goes one higher.
	 */
	.fold {
		position: absolute;
		top: calc(-1 * var(--tear));
		right: 0;
		width: 84px;
		height: 84px;
		z-index: 2;
		pointer-events: none;
	}

	.paint {
		display: block;
		/* The stroke sits on the path, so half of it falls outside the box. */
		overflow: visible;
	}

	/*
	 * The square the crease cuts across: from the tear's own top down to the
	 * flap's far corner, and in from the paper's edge by the length of the
	 * crease. `SIZE` is the 84px above, `LEG` the 60 below.
	 */
	.catch {
		position: absolute;
		top: 0;
		right: 0;
		width: 64.5px;
		height: 68px;
		pointer-events: auto;
	}

	.ground {
		fill: var(--paper);
		stroke: none;
	}
</style>
