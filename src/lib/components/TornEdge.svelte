<script lang="ts">
	import { handTear } from '$lib/draw/hand';
	import { seedFrom } from '$lib/draw/rng';

	/**
	 * `flip` turns the teeth over, for the bottom of a sheet. `mirror` turns the
	 * tear left for right, which is the same tear seen from the other side of
	 * the paper — it is what the menu closes itself with, since the menu is this
	 * sheet's back.
	 */
	type Props = { seed: string; flip?: boolean; mirror?: boolean };

	let { seed, flip = false, mirror = false }: Props = $props();

	const HEIGHT = 16;
	/** Roughly one tooth every 16px, whatever the screen is. */
	const TOOTH = 16;

	/*
	 * Measured and drawn at its real width, rather than drawn once in a fixed
	 * viewBox and stretched.
	 *
	 * Stretching is what made the line weight uneven: mapping a 1000-unit
	 * viewBox onto a 358px column squashes the path along one axis only, and a
	 * stroke under an anisotropic transform comes out thinner on the segments
	 * that were compressed most. `vector-effect="non-scaling-stroke"` is meant
	 * to cover that and does not, consistently. Drawing at 1:1 removes the
	 * transform, so every segment is the same weight because nothing is scaled.
	 */
	let width = $state(0);

	const d = $derived(
		width > 0
			? handTear(width, HEIGHT, {
					seed: seedFrom(seed),
					teeth: Math.max(8, Math.round(width / TOOTH))
				})
			: ''
	);

	/*
	 * What is past the tear, which is not paper.
	 *
	 * The zigzag is only a line; laid over writing it lets the writing go on
	 * past it, so the tear reads as a mark drawn across the page rather than as
	 * where the page stops. This closes the same path along the **outer** edge
	 * and fills that side with paper, so anything scrolling up meets the teeth
	 * and is cut by them — jagged, tooth by tooth, which is what a torn edge
	 * cutting something looks like.
	 *
	 * Closed a full `HEIGHT` past `0`, which is the outside: on the top tear
	 * that is the room above the sheet, and on the bottom the whole svg is
	 * turned over, so it is the room below. Nothing is filled on the inside —
	 * the paper's own ground is already there, and a second one painted over it
	 * is the white rectangle this replaced.
	 *
	 * Past the box and not merely to it, because the marks this cuts do not
	 * stop at the box either: the box is `overflow: visible` for its own
	 * stroke's sake, and the side edges running up into it carry a round cap
	 * that reaches a little beyond their own. Closed flush at nought, that cap
	 * came out above the teeth as a stray tick of ink.
	 *
	 * Two strips carry that past the ends as well.
	 *
	 * The box is trimmed to the two side edges, so the tear begins and ends on
	 * the line running down the middle of one — which leaves the outer half of
	 * that line, and the cap on the end of it, standing clear of the fill. The
	 * strips are the same paper reaching `PAD` further out at each end, down as
	 * far as the corner the tear made there and no further: below the corner
	 * the side edge is the paper's own edge and has to be seen. Only outside
	 * the tear's own span, so nothing is filled over a notch — one rectangle
	 * across the whole width would cut the paper straight along the midline
	 * wherever a tooth reached above it.
	 */
	const PAD = 6;

	/*
	 * The two corners: where the zigzag starts, and where it stopped.
	 *
	 * It starts at the midline and ends on a full-width tooth, which is
	 * somewhere else — so the right-hand strip has to follow it down, and the
	 * path is the only place that says where that is. `handPath` writes plain
	 * numbers separated by spaces, so the last of them is the y it ended on.
	 */
	const ends = $derived.by(() => {
		const at = d.split(' ');
		return { left: HEIGHT / 2, right: d === '' ? HEIGHT / 2 : Number(at[at.length - 1]) };
	});

	const ground = $derived(
		d === ''
			? ''
			: [
					`${d} L ${width} ${-HEIGHT} L 0 ${-HEIGHT} Z`,
					`M ${-PAD} ${-HEIGHT} L 0 ${-HEIGHT} L 0 ${ends.left} L ${-PAD} ${ends.left} Z`,
					`M ${width} ${-HEIGHT} L ${width + PAD} ${-HEIGHT} L ${width + PAD} ${ends.right} L ${width} ${ends.right} Z`
				].join(' ')
	);
</script>

<svg
	class="tear"
	class:flip
	class:mirror
	bind:clientWidth={width}
	height={HEIGHT}
	aria-hidden="true"
>
	{#if d}
		<path d={ground} class="ground" />
		<path {d} class="drawn" />
	{/if}
</svg>

<style>
	.tear {
		display: block;
		width: 100%;
		/* HEIGHT above, named in app.css so the corner buttons can clear it. */
		height: var(--tear);
		/* The teeth reach the edges of the box and the stroke sits on the path,
		   so half of it falls outside. */
		overflow: visible;
	}

	/* Not a mark: filled and never stroked. */
	.ground {
		fill: var(--paper);
		stroke: none;
	}

	.flip {
		transform: scaleY(-1);
	}

	.mirror {
		transform: scaleX(-1);
	}

	/* The bottom of the paper, seen from behind: turned over both ways. */
	.flip.mirror {
		transform: scale(-1, -1);
	}
</style>
