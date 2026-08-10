<script lang="ts">
	import { handLine } from '$lib/draw/hand';
	import { seedFrom } from '$lib/draw/rng';

	/*
	 * A tear-off line across the paper: the mark that says one part of the sheet
	 * ends and another begins, without naming either.
	 *
	 * Loose ends has one because there is nothing there to call a heading, and
	 * the menu has them for the same reason — the panel's sections are already
	 * named by what is in them, and a second set of headings would be labelling
	 * the labels.
	 *
	 * Measured rather than stretched, like every other drawn line here: a rule
	 * generated once and scaled to fit comes out with an uneven weight, because
	 * a stroke under an anisotropic transform is thinner along the squashed
	 * axis.
	 */

	type Props = { seed: string };

	let { seed }: Props = $props();

	let width = $state(0);

	const line = $derived(
		width > 0 ? handLine(width, { seed: seedFrom(`perf${seed}`), wobble: 1.2, y: 2 }) : ''
	);
</script>

<svg bind:clientWidth={width} height="5" aria-hidden="true">
	{#if width > 0}
		<path d={line} class="drawn drawn--dashed" />
	{/if}
</svg>

<style>
	svg {
		display: block;
		width: 100%;
		height: 5px;
		overflow: visible;
	}
</style>
