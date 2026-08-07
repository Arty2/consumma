<script lang="ts">
	import { handTear } from '$lib/draw/hand';
	import { seedFrom } from '$lib/draw/rng';

	type Props = { seed: string; flip?: boolean };

	let { seed, flip = false }: Props = $props();

	/*
	 * Drawn once in a fixed viewBox and stretched with
	 * preserveAspectRatio="none", so it fits any width without recomputing.
	 * non-scaling-stroke keeps the line the same weight as everything else
	 * despite the horizontal scale.
	 *
	 * Stroke only — no fill and no mask. The sheet and the page are both white,
	 * so the tear reads as a drawn line, exactly as in the sketch.
	 */
	const d = $derived(handTear(1000, 16, { seed: seedFrom(seed), teeth: 22 }));
</script>

<svg class="tear" class:flip viewBox="0 0 1000 16" preserveAspectRatio="none" aria-hidden="true">
	<path {d} class="drawn" vector-effect="non-scaling-stroke" />
</svg>

<style>
	.tear {
		display: block;
		width: 100%;
		height: 16px;
	}

	.flip {
		transform: scaleY(-1);
	}
</style>
