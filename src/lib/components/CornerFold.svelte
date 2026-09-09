<script lang="ts">
	import { handPath, handScribble, SCRIBBLE } from '$lib/draw/hand';
	import { seedFrom } from '$lib/draw/rng';
	import { drag } from '$lib/dnd/drag.svelte';

	/**
	 * The paper's top-right corner, turned down while a group is in hand.
	 *
	 * It is only ever there during that one gesture, and it takes the room the
	 * theme and the burger leave: neither of those has anything to say to a
	 * group being carried, so they go, and what appears in their place is the
	 * one thing that has. A group let go on the flap is removed, tasks and all,
	 * with the same undo the header's own mark leaves.
	 *
	 * Nothing here is animated. A corner is either turned down or it is not,
	 * and the two states are half a second apart under a finger that is already
	 * moving — a fold that grew would be a mark doing something a fold does
	 * not.
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
	 * `.catch` below is clipped to the same diagonal these describe. Move one
	 * and move the other.
	 */
	const SIZE = 84;
	const TEAR = 16;
	const EDGE = 9;
	/** The tear's midline, which is where the paper actually stops. */
	const TOP = TEAR / 2;
	/** Where the side's stroke runs, which is where the paper actually stops. */
	const RIGHT = SIZE - EDGE / 2;
	/**
	 * How far along each edge the fold reaches. Equal, so the flap is square,
	 * and about as much room as the two buttons it stands in for took.
	 */
	const LEG = 60;

	/** Where the fold meets the torn top edge, and where it meets the side. */
	const A = { x: SIZE - EDGE / 2 - LEG, y: TOP };
	const C = { x: RIGHT, y: TOP + LEG };

	/**
	 * What is past the fold, which is not paper.
	 *
	 * The same trick the tear uses: close the shape along the outside and fill
	 * that side with paper, so the marks running into it are cut rather than
	 * drawn over. Here what is cut is the torn edge and the side edge, and they
	 * are cut *on the diagonal* — the closing segment runs from the far corner
	 * straight through both ends of the fold line, so a tooth reaching past it
	 * ends on the fold rather than on a vertical a hand never drew.
	 *
	 * Closed well past the box, because the marks it cuts do not stop at the
	 * box either: the tear's teeth dip a full half-height below their midline
	 * and the side's stroke carries a round cap beyond its own end.
	 */
	const OVER = 24;
	const slope = (C.y - A.y) / (C.x - A.x);
	const far = { x: A.x - (A.y + OVER) / slope, y: -OVER };

	const ground = `M ${far.x} ${far.y} L ${SIZE + OVER} ${-OVER} L ${SIZE + OVER} ${C.y} L ${C.x} ${C.y} Z`;

	const crease = handPath([A, C], { seed: seedFrom('cornerfold'), wobble: 1.1 });

	/*
	 * The app's one delete drawing, at the app's one delete seed — the same
	 * mark that is on a done task and on a finished group's header, because it
	 * means the same thing here. Faint while it is only an offer and full ink
	 * once the group is over it, which is the rule the add row's own box
	 * follows.
	 */
	const scribble = handScribble(SCRIBBLE.w, SCRIBBLE.h, {
		seed: seedFrom(SCRIBBLE.seed),
		wobble: 0.7
	});

	/**
	 * Centred in the flap, which for a right triangle is up towards the corner
	 * — and far enough off the crease that the mark keeps its air at the one
	 * corner of its box that comes nearest to it.
	 */
	const MARK = { x: 52.5, y: 17 };
</script>

<div class="fold" aria-hidden="true">
	<svg class="paint" viewBox="0 0 {SIZE} {SIZE}" width={SIZE} height={SIZE}>
		<path d={ground} class="ground" />
		<path d={crease} class="drawn" />
		<g transform="translate({MARK.x} {MARK.y})">
			<path d={scribble} class="drawn" class:drawn--faint={!drag.overFold} />
		</g>
	</svg>

	<!--
		The flap, and only the flap.

		A square target would be twice the paper it is drawn on, and the top of
		the list is directly under it — carrying a group up to make it first
		would land on a delete. Clipped to the fold itself, what is left over the
		list is a sliver at the paper's own edge.
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
	 * The same diagonal the crease is drawn along, give or take the wobble:
	 * (19.5, 8) to (79.5, 68), carried out to the box's own corners so
	 * everything past the fold is included. `SIZE` is the 84px below.
	 */
	.catch {
		position: absolute;
		inset: 0;
		pointer-events: auto;
		clip-path: polygon(19.5px 0, 100% 0, 100% 68px, 19.5px 8px);
	}

	.ground {
		fill: var(--paper);
		stroke: none;
	}
</style>
