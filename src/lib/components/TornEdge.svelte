<script lang="ts">
	import { handTear } from '$lib/draw/hand';
	import { seedFrom } from '$lib/draw/rng';

	type Props = { seed: string; flip?: boolean };

	let { seed, flip = false }: Props = $props();

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
</script>

<svg class="tear" class:flip bind:clientWidth={width} height={HEIGHT} aria-hidden="true">
	{#if d}
		<path {d} class="drawn" />
	{/if}
</svg>

<style>
	.tear {
		display: block;
		width: 100%;
		height: 16px;
		/* The teeth reach the edges of the box and the stroke sits on the path,
		   so half of it falls outside. */
		overflow: visible;
	}

	.flip {
		transform: scaleY(-1);
	}
</style>
