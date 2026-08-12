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
	 * The paper itself, up to where it was torn.
	 *
	 * The zigzag is only a line; on its own it leaves whatever fills the box
	 * behind it filling both sides of the tear, so the teeth cut nothing. This
	 * closes the same path along the inner edge and fills it, so the paper comes
	 * up to the tear and stops — and the notches are the paper's absence rather
	 * than a mark drawn over it.
	 *
	 * Closed along `HEIGHT`, which is the inside; on the bottom tear the whole
	 * svg is turned over, so the inside is where it should be there too.
	 */
	const ground = $derived(d === '' ? '' : `${d} L ${width} ${HEIGHT} L 0 ${HEIGHT} Z`);
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

	/* The paper, not a mark: filled and never stroked. */
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
