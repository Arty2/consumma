<script lang="ts">
	import { handVertical } from '$lib/draw/hand';
	import { seedFrom } from '$lib/draw/rng';

	/*
	 * The left or right edge of the sheet.
	 *
	 * The torn edges close the paper top and bottom. Without sides it is text on
	 * a page rather than a strip of paper, so these run the height of the list
	 * between the two tears.
	 *
	 * Measured and drawn at its real height, like the tear, so the weight matches
	 * it exactly — a path drawn once and stretched to fit comes out thinner along
	 * whichever axis was compressed.
	 */

	type Props = { seed: string; side: 'left' | 'right' };

	let { seed, side }: Props = $props();

	const WIDTH = 5;

	let height = $state(0);

	const d = $derived(
		height > 0 ? handVertical(height, { seed: seedFrom(seed), wobble: 1.1, x: WIDTH / 2 }) : ''
	);
</script>

<svg class="edge {side}" bind:clientHeight={height} width={WIDTH} aria-hidden="true">
	{#if d}
		<path {d} class="drawn" />
	{/if}
</svg>

<style>
	.edge {
		position: absolute;
		top: 0;
		width: 5px;
		/*
		 * Explicit, not from top/bottom: an svg is a replaced element, so `height:
		 * auto` resolves to its intrinsic 150px and the offsets are ignored. The
		 * edge then stopped a third of the way down the sheet.
		 */
		height: 100%;
		/* The stroke sits on the path, so half of it falls outside the box. */
		overflow: visible;
		pointer-events: none;
	}

	.left {
		left: 0;
	}

	.right {
		right: 0;
	}
</style>
