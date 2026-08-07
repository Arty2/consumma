<script lang="ts">
	import { handRect } from '$lib/draw/hand';
	import { seedFrom } from '$lib/draw/rng';

	type Props = {
		/** A stable id — the room, a task, a group. Never an index. */
		seed: string;
		wobble?: number;
		dashed?: boolean;
	};

	let { seed, wobble = 1.6, dashed = false }: Props = $props();

	/*
	 * Measured rather than stretched: a box drawn in a fixed viewBox and scaled
	 * to fit would squash its wobble along one axis. Re-measuring redraws, but
	 * the seed is stable, so the same box comes back — it does not twitch.
	 */
	let width = $state(0);
	let height = $state(0);

	const d = $derived(
		width > 0 && height > 0 ? handRect(width, height, { seed: seedFrom(seed), wobble }) : ''
	);
</script>

<svg class="rect" bind:clientWidth={width} bind:clientHeight={height} aria-hidden="true">
	{#if d}
		<path {d} class="drawn" class:drawn--dashed={dashed} />
	{/if}
</svg>

<style>
	.rect {
		position: absolute;
		inset: 0;
		width: 100%;
		height: 100%;
		overflow: visible;
		pointer-events: none;
	}
</style>
