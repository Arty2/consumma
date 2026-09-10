<script lang="ts">
	import { handOval } from '$lib/draw/hand';
	import { seedFrom } from '$lib/draw/rng';

	/**
	 * A loop drawn round whatever this is put in — the same job HandRect does,
	 * in the one hand that means "here" rather than "this is a box".
	 */
	type Props = {
		/** A stable id — the control, never an index. */
		seed: string;
		wobble?: number;
		dashed?: boolean;
		/** Degrees off level. A hand circling a word never squares it up. */
		tilt?: number;
	};

	let { seed, wobble = 1.6, dashed = false, tilt = -3 }: Props = $props();

	/*
	 * Measured rather than stretched, for the reason HandRect is: a loop drawn
	 * in a fixed viewBox and scaled to fit would squash its wobble along one
	 * axis. The seed is stable, so re-measuring redraws the same loop.
	 */
	let width = $state(0);
	let height = $state(0);

	const d = $derived(
		width > 0 && height > 0 ? handOval(width, height, { seed: seedFrom(seed), wobble, tilt }) : ''
	);
</script>

<svg class="oval" bind:clientWidth={width} bind:clientHeight={height} aria-hidden="true">
	{#if d}
		<path {d} class="drawn" class:drawn--dashed={dashed} />
	{/if}
</svg>

<style>
	.oval {
		position: absolute;
		inset: 0;
		width: 100%;
		height: 100%;
		/* Tilted, so it reaches past its own box at two corners. */
		overflow: visible;
		pointer-events: none;
	}
</style>
